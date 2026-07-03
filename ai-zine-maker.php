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
	<?php $azm_ai_badge = get_post_meta( $post->ID, '_zf_ai_badge', true ); ?>
	<div id="azm-root"
		data-pages="<?php echo esc_attr( base64_encode( $pages ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- encoding JSON for HTML data attribute, not obfuscation ?>"
		data-format="<?php echo esc_attr( $format ); ?>"
		data-post-id="<?php echo esc_attr( $post->ID ); ?>"
		data-post-type="<?php echo esc_attr( $post->post_type ); ?>"
		data-ai-disclosure="<?php echo esc_attr( $azm_ai_badge ); ?>"></div>
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
		register_post_meta(
			$pt,
			'_zf_ai_badge',
			array(
				'show_in_rest'  => true,
				'single'        => true,
				'type'          => 'string',
				'default'       => '',
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

// ---------- AI Disclosure Meta Box ----------

add_action( 'add_meta_boxes', 'azm_add_badge_meta_box' );
/**
 * Register AI disclosure meta box.
 */
function azm_add_badge_meta_box() {
	add_meta_box( 'azm_ai_badge', 'AI Disclosure', 'azm_render_badge_meta_box', array( 'post', 'zine' ), 'side', 'high' );
}

/**
 * Render the AI disclosure meta box.
 *
 * @param WP_Post $post Current post object.
 */
function azm_render_badge_meta_box( $post ) {
	wp_nonce_field( 'azm_badge_save', 'azm_badge_nonce' );
	$badge = get_post_meta( $post->ID, '_zf_ai_badge', true );
	?>
	<p style="margin-bottom:.6rem;font-size:12px;color:#666">Select the level of AI involvement in this zine. This will display a disclosure badge to readers.</p>
	<fieldset style="border:none;padding:0;margin:0">
		<label style="display:flex;align-items:flex-start;gap:.4rem;margin-bottom:.6rem">
			<input type="radio" name="azm_ai_badge" value="assisted" <?php checked( $badge, 'assisted' ); ?> style="margin-top:3px">
			<span><strong>AI Assisted</strong><br><span style="font-size:11px;color:#666">AI tools helped draft or refine content, but it was directed and heavily edited by a human.</span></span>
		</label>
		<label style="display:flex;align-items:flex-start;gap:.4rem">
			<input type="radio" name="azm_ai_badge" value="generated" <?php checked( $badge, 'generated' ); ?> style="margin-top:3px">
			<span><strong>AI Generated</strong><br><span style="font-size:11px;color:#666">Content was created entirely by AI with minimal or no human intervention.</span></span>
		</label>
	</fieldset>
	<?php
}

add_action( 'save_post', 'azm_save_badge_meta', 10, 2 );
/**
 * Save AI disclosure badge meta on post save.
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
	$allowed = array( '', 'assisted', 'generated' );
	$value   = isset( $_POST['azm_ai_badge'] ) ? sanitize_text_field( wp_unslash( $_POST['azm_ai_badge'] ) ) : '';
	if ( in_array( $value, $allowed, true ) ) {
		if ( '' === $value ) {
			delete_post_meta( $post_id, '_zf_ai_badge' );
		} else {
			update_post_meta( $post_id, '_zf_ai_badge', $value );
		}
	}
}

// Frontend AI badge is rendered directly in templates/zine-display.php, above the Download PDF button.

// ---------- Flush Rewrite on Activation ----------

register_activation_hook(
	__FILE__,
	function () {
		azm_register_cpt();
		flush_rewrite_rules();
	}
);
