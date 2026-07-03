<?php
/**
 * Plugin Name: AI Zine Maker
 * Description: Create and publish digital zines with a drag-and-drop editor. Supports mini-zine and A5 booklet formats.
 * Version: 2.0.0
 * Author: Tess Needham
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ai-zine-maker
 *
 * @package AiZineMaker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AZM_VERSION', '2.0.0' );
define( 'AZM_PATH', plugin_dir_path( __FILE__ ) );
define( 'AZM_URL', plugin_dir_url( __FILE__ ) );

// ---------- Custom Post Type ----------

add_action( 'init', 'azm_register_cpt' );
/**
 * Register the Zine custom post type.
 */
function azm_register_cpt() {
	register_post_type(
		'zine',
		array(
			'label'        => 'Zines',
			'public'       => false,
			'show_ui'      => true,
			'show_in_menu' => false,
			'menu_icon'    => 'dashicons-book-alt',
			'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
			'rewrite'      => false,
			'has_archive'  => false,
			'show_in_rest' => true,
		)
	);
}

// ---------- Register Post Meta (exposes to REST for block editor migration reads) ----------

// ---------- Meta Box ----------

add_action( 'add_meta_boxes', 'azm_add_meta_boxes' );
/**
 * Register zine editor meta boxes.
 */
function azm_add_meta_boxes() {
	foreach ( array( 'post', 'page', 'zine' ) as $pt ) {
		add_meta_box( 'azm_editor', 'Zine Editor', 'azm_render_editor_metabox', $pt, 'normal', 'high' );
	}
}

/**
 * Render the zine editor meta box.
 *
 * @param WP_Post $post Current post object.
 */
function azm_render_editor_metabox( $post ) {
	wp_nonce_field( 'azm_save_zine', 'azm_nonce' );
	$azm_praw = get_post_meta( $post->ID, '_azm_pages', true );
	$pages    = $azm_praw ? $azm_praw : '[]';
	$azm_fraw = get_post_meta( $post->ID, '_azm_format', true );
	$format   = $azm_fraw ? $azm_fraw : 'mini-zine';
	?>
	<div id="azm-root"
		data-pages="<?php echo esc_attr( base64_encode( $pages ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- encoding JSON for HTML data attribute, not obfuscation ?>"
		data-format="<?php echo esc_attr( $format ); ?>"
		data-post-id="<?php echo esc_attr( $post->ID ); ?>"></div>
	<?php
}

// ---------- Register Post Meta (exposes to REST for future use) ----------

add_action( 'init', 'azm_register_meta' );
/**
 * Register post meta fields for the REST API.
 */
function azm_register_meta() {
	$auth = function () {
		return current_user_can( 'edit_posts' );
	};
	foreach ( array( 'post', 'page', 'zine' ) as $pt ) {
		register_post_meta(
			$pt,
			'_azm_pages',
			array(
				'show_in_rest'  => true,
				'single'        => true,
				'type'          => 'string',
				'default'       => '[]',
				'auth_callback' => $auth,
			)
		);
		register_post_meta(
			$pt,
			'_azm_format',
			array(
				'show_in_rest'  => true,
				'single'        => true,
				'type'          => 'string',
				'default'       => 'mini-zine',
				'auth_callback' => $auth,
			)
		);
	}
}

// ---------- Save Meta ----------

add_action( 'save_post', 'azm_save_meta', 10, 2 );
/**
 * Save zine editor meta on post save.
 *
 * @param int     $post_id Post ID.
 * @param WP_Post $post    Post object (unused but required by hook signature).
 */
function azm_save_meta( $post_id, $post ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- $post required by save_post hook signature
	if ( ! isset( $_POST['azm_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['azm_nonce'] ) ), 'azm_save_zine' ) ) {
		return;
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}

	if ( isset( $_POST['azm_pages'] ) ) {
		$pages   = wp_unslash( $_POST['azm_pages'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- JSON blob; structure is validated by json_decode on the next line.
		$decoded = json_decode( $pages );
		if ( null !== $decoded ) {
			update_post_meta( $post_id, '_azm_pages', wp_slash( $pages ) );
		}
	}
	if ( isset( $_POST['azm_format'] ) ) {
		$format = sanitize_text_field( wp_unslash( $_POST['azm_format'] ) );
		if ( in_array( $format, array( 'mini-zine', 'a5-booklet' ), true ) ) {
			update_post_meta( $post_id, '_azm_format', $format );
		}
	}
}

// ---------- Enqueue Admin Assets ----------

add_action( 'admin_enqueue_scripts', 'azm_admin_assets' );
/**
 * Enqueue admin assets for the zine editor.
 *
 * @param string $hook Current admin page hook (unused but required by hook signature).
 */
function azm_admin_assets( $hook ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found -- $hook required by admin_enqueue_scripts signature
	$screen = get_current_screen();
	if ( ! $screen || ! in_array( $screen->post_type, array( 'post', 'page', 'zine' ), true ) ) {
		return;
	}

	wp_enqueue_media();
	wp_enqueue_style( 'azm-admin', AZM_URL . 'assets/css/admin.css', array(), AZM_VERSION );
	wp_enqueue_script( 'azm-admin', AZM_URL . 'assets/js/admin.js', array(), AZM_VERSION, true );

	wp_localize_script(
		'azm-admin',
		'AZM',
		array(
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
			'uploadDir' => wp_upload_dir()['baseurl'],
		)
	);
}

// ---------- REST API ----------

// AI text and image generation removed in v2.0.0.

/* AI generation functions removed in v2.0.0. */
// ---------- Zine Block ----------

add_action( 'init', 'azm_register_block' );
/**
 * Register the azm/zine Gutenberg block.
 */
function azm_register_block() {
	if ( ! function_exists( 'register_block_type' ) ) {
		return;
	}

	wp_register_script(
		'azm-zine-block',
		AZM_URL . 'assets/js/zine-block.js',
		array( 'wp-blocks', 'wp-element', 'wp-block-editor' ),
		AZM_VERSION,
		true
	);
	wp_register_style(
		'azm-zine-block-editor',
		AZM_URL . 'assets/css/zine-block-editor.css',
		array( 'wp-edit-blocks' ),
		AZM_VERSION
	);

	register_block_type(
		'azm/zine',
		array(
			'editor_script'   => 'azm-zine-block',
			'editor_style'    => 'azm-zine-block-editor',
			'render_callback' => 'azm_render_zine_block',
		)
	);
}

/**
 * Block render callback for azm/zine.
 *
 * @param array    $attrs   Block attributes (unused).
 * @param string   $content Block content (unused).
 * @param WP_Block $block   Block instance (unused).
 * @return string Rendered HTML or empty string.
 */
function azm_render_zine_block( $attrs, $content, $block ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- all params required by render_callback signature
	if ( ! is_singular() ) {
		return '';
	}

	$post_id   = get_the_ID();
	$azm_prw   = get_post_meta( $post_id, '_azm_pages', true );
	$raw_pages = $azm_prw ? $azm_prw : '[]';
	$azm_frw   = get_post_meta( $post_id, '_azm_format', true );
	$format    = $azm_frw ? $azm_frw : 'mini-zine';
	$pages     = json_decode( $raw_pages, true );

	if ( empty( $pages ) ) {
		return '';
	}

	wp_enqueue_style( 'azm-frontend', AZM_URL . 'assets/css/frontend.css', array(), AZM_VERSION );
	wp_enqueue_script( 'azm-frontend', AZM_URL . 'assets/js/frontend.js', array(), AZM_VERSION, true );

	wp_localize_script(
		'azm-frontend',
		'AZM_ZINE',
		array(
			'pages'  => $pages,
			'format' => $format,
			'title'  => get_the_title( $post_id ),
		)
	);

	ob_start();
	include AZM_PATH . 'templates/zine-display.php';
	return ob_get_clean();
}

// Pre-populate new zine posts with the block so users can add blocks above/below it.
add_filter( 'default_content', 'azm_default_post_content', 10, 2 );
/**
 * Pre-populate new zine posts with the block.
 *
 * @param string  $content Default post content.
 * @param WP_Post $post    Post being created.
 * @return string Modified content.
 */
function azm_default_post_content( $content, $post ) {
	if ( 'zine' === $post->post_type ) {
		return '<!-- wp:azm/zine /-->';
	}
	return $content;
}

// ---------- Frontend Display ----------

// Prevent WordPress from auto-generating an excerpt from the zine HTML.
// Only show the excerpt if the author has explicitly written one.
add_filter( 'get_the_excerpt', 'azm_suppress_auto_excerpt', 10, 2 );
/**
 * Suppress auto-excerpt for zine posts.
 *
 * @param string  $excerpt Current excerpt.
 * @param WP_Post $post    Post object.
 * @return string Modified excerpt.
 */
function azm_suppress_auto_excerpt( $excerpt, $post ) {
	if ( 'zine' === $post->post_type && empty( $post->post_excerpt ) ) {
		return '';
	}
	return $excerpt;
}

// Fallback for existing zines that pre-date the block (no wp:azm/zine in their content).
add_filter( 'the_content', 'azm_render_frontend' );
/**
 * Frontend fallback renderer for pre-block zines.
 *
 * @param string $content Post content.
 * @return string Modified content.
 */
function azm_render_frontend( $content ) {
	if ( ! is_singular( 'zine' ) ) {
		return $content;
	}
	if ( has_block( 'azm/zine' ) ) {
		return $content;
	}

	$post_id  = get_the_ID();
	$azm_prw3 = get_post_meta( $post_id, '_azm_pages', true );
	$pages    = json_decode( $azm_prw3 ? $azm_prw3 : '[]', true );

	if ( empty( $pages ) ) {
		return $content;
	}

	wp_enqueue_style( 'azm-frontend', AZM_URL . 'assets/css/frontend.css', array(), AZM_VERSION );
	wp_enqueue_script( 'azm-frontend', AZM_URL . 'assets/js/frontend.js', array(), AZM_VERSION, true );

	$azm_prw2  = get_post_meta( $post_id, '_azm_pages', true );
	$raw_pages = $azm_prw2 ? $azm_prw2 : '[]';
	$azm_frw2  = get_post_meta( $post_id, '_azm_format', true );
	wp_localize_script(
		'azm-frontend',
		'AZM_ZINE',
		array(
			'pages'  => json_decode( $raw_pages, true ),
			'format' => $azm_frw2 ? $azm_frw2 : 'mini-zine',
			'title'  => get_the_title( $post_id ),
		)
	);

	ob_start();
	include AZM_PATH . 'templates/zine-display.php';
	return ob_get_clean();
}

// ---------- AI Badge Meta Box ----------

add_action( 'add_meta_boxes', 'azm_add_badge_meta_box' );
/**
 * Register AI badge meta box.
 */
function azm_add_badge_meta_box() {
	add_meta_box( 'azm_ai_badge', 'AI Content', 'azm_render_badge_meta_box', array( 'post', 'zine' ), 'side', 'high' );
}

/**
 * Render the AI badge meta box.
 *
 * @param WP_Post $post Current post object.
 */
function azm_render_badge_meta_box( $post ) {
	wp_nonce_field( 'azm_badge_save', 'azm_badge_nonce' );
	$has_badge = get_post_meta( $post->ID, '_zf_ai_badge', true );
	$locked_ai = get_post_meta( $post->ID, '_azm_ai_used', true );
	?>
	<p style="margin-bottom:.5rem;font-size:12px;color:#666">
		Check this box if your zine contains any AI-generated text or images.
	</p>
	<label style="display:flex;align-items:center;gap:.4rem;font-weight:600">
		<input type="checkbox" name="azm_ai_badge" value="1"
			<?php checked( $has_badge || $locked_ai ); ?>
			<?php
			if ( $locked_ai ) {
				echo 'disabled title="AI tools were used — this cannot be unchecked."';}
			?>
		>
		This zine contains AI-generated content
	</label>
	<?php if ( $locked_ai ) : ?>
		<input type="hidden" name="azm_ai_badge" value="1">
		<p style="margin-top:.5rem;font-size:11px;color:#c00">AI tools were used in this zine. This badge cannot be removed.</p>
	<?php endif; ?>
	<p style="margin-top:.75rem;font-size:11px;color:#666">
		If AI content was used and this box is unchecked, publishing will be blocked.
		<a href="/contact/" target="_blank">Contact admin</a> if you believe this is an error.
	</p>
	<?php
}

add_action( 'save_post', 'azm_save_badge_meta', 10, 2 );
/**
 * Save AI badge meta on post save.
 *
 * @param int     $post_id Post ID.
 * @param WP_Post $post    Post object (unused but required by hook signature).
 */
function azm_save_badge_meta( $post_id, $post ) { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- $post required by save_post hook
	if ( ! isset( $_POST['azm_badge_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['azm_badge_nonce'] ) ), 'azm_badge_save' ) ) {
		return;
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}

	if ( isset( $_POST['azm_ai_badge'] ) && '1' === $_POST['azm_ai_badge'] ) {
		update_post_meta( $post_id, '_zf_ai_badge', '1' );
	} elseif ( ! get_post_meta( $post_id, '_azm_ai_used', true ) ) {
		// Only allow removing if AI tools were NOT used.
		delete_post_meta( $post_id, '_zf_ai_badge' );
	}
}


// Block publish if AI content detected but badge missing.
add_action( 'wp_insert_post_data', 'azm_enforce_ai_badge', 10, 2 );
/**
 * Enforce AI badge requirement before publishing.
 *
 * @param array $data    Sanitized post data.
 * @param array $postarr Raw post array.
 * @return array Modified post data.
 */
function azm_enforce_ai_badge( $data, $postarr ) {
	if ( 'publish' !== $data['post_status'] ) {
		return $data;
	}
	if ( ! in_array( $data['post_type'], array( 'post', 'zine' ), true ) ) {
		return $data;
	}
	if ( ! isset( $postarr['ID'] ) || ! $postarr['ID'] ) {
		return $data;
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return $data;
	}

	$post_id    = (int) $postarr['ID'];
	$ai_used    = get_post_meta( $post_id, '_azm_ai_used', true );
	$has_badge  = isset( $postarr['azm_ai_badge'] ) && '1' === $postarr['azm_ai_badge'];
	$badge_meta = get_post_meta( $post_id, '_zf_ai_badge', true );

	if ( $ai_used && ! $has_badge && ! $badge_meta ) {
		// Revert to draft — block publish.
		$data['post_status'] = 'draft';
		add_filter(
			'redirect_post_location',
			function ( $loc ) {
				return add_query_arg( 'azm_badge_error', '1', $loc );
			}
		);
	}
	return $data;
}

// Show publish-blocked admin notice.
add_action(
	'admin_notices',
	function () {
		if ( isset( $_GET['azm_badge_error'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display-only flag set by redirect_post_location filter, no data processed
			echo '<div class="notice notice-error"><p><strong>Publish blocked:</strong> AI content was detected in this zine. Please check the &quot;This zine contains AI-generated content&quot; checkbox before publishing. <a href="/contact/">Contact admin</a> if you believe this is incorrect.</p></div>';
		}
	}
);

// Frontend AI badge display.
add_filter( 'the_content', 'azm_inject_ai_badge', 5 );
/**
 * Inject AI badge before zine/post content.
 *
 * @param string $content Post content.
 * @return string Modified content.
 */
function azm_inject_ai_badge( $content ) {
	if ( ! is_singular( array( 'post', 'zine' ) ) ) {
		return $content;
	}
	if ( ! get_post_meta( get_the_ID(), '_zf_ai_badge', true ) ) {
		return $content;
	}
	$badge = '<div class="zf-ai-badge" style="display:inline-flex;align-items:center;gap:.3em;background:#22BEE8;color:#1F1E1D;font-family:\'Bebas Neue\',sans-serif;font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;padding:.3em .7em;border:2px solid #1F1E1D;margin-bottom:1.5rem">AI-assisted creation</div>';
	return $badge . $content;
}

// ---------- Flush Rewrite on Activation ----------

register_activation_hook(
	__FILE__,
	function () {
		azm_register_cpt();
		flush_rewrite_rules();
	}
);
