<?php
/**
 * Plugin Name: Zine Maker
 * Description: Create digital zines from text and images with optional AI-generated copy and illustrations.
 * Version: 1.3.8
 * Author: Tess Needham
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ai-zine-maker
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'AZM_VERSION', '1.3.8' );
define( 'AZM_PATH', plugin_dir_path( __FILE__ ) );
define( 'AZM_URL', plugin_dir_url( __FILE__ ) );

// ---------- Custom Post Type ----------

add_action( 'init', 'azm_register_cpt' );
function azm_register_cpt() {
	register_post_type( 'zine', [
		'label'        => 'Zines',
		'public'       => false,
		'show_ui'      => true,
		'show_in_menu' => false,
		'menu_icon'    => 'dashicons-book-alt',
		'supports'     => [ 'title', 'editor', 'thumbnail', 'excerpt' ],
		'rewrite'      => false,
		'has_archive'  => false,
		'show_in_rest' => true,
	] );
}

// ---------- Register Post Meta (exposes to REST for block editor migration reads) ----------

// ---------- Meta Box ----------

add_action( 'add_meta_boxes', 'azm_add_meta_boxes' );
function azm_add_meta_boxes() {
	foreach ( [ 'post', 'page', 'zine' ] as $pt ) {
		add_meta_box( 'azm_editor', 'Zine Editor', 'azm_render_editor_metabox', $pt, 'normal', 'high' );
	}
}

function azm_render_editor_metabox( $post ) {
	wp_nonce_field( 'azm_save_zine', 'azm_nonce' );
	$pages  = get_post_meta( $post->ID, '_azm_pages', true ) ?: '[]';
	$format = get_post_meta( $post->ID, '_azm_format', true ) ?: 'mini-zine';
	?>
	<div id="azm-root"
		data-pages="<?php echo esc_attr( base64_encode( $pages ) ); ?>"
		data-format="<?php echo esc_attr( $format ); ?>"
		data-post-id="<?php echo esc_attr( $post->ID ); ?>"></div>
	<?php
}

// ---------- Register Post Meta (exposes to REST for future use) ----------

add_action( 'init', 'azm_register_meta' );
function azm_register_meta() {
	$auth = function() { return current_user_can( 'edit_posts' ); };
	foreach ( [ 'post', 'page', 'zine' ] as $pt ) {
		register_post_meta( $pt, '_azm_pages', [
			'show_in_rest'  => true,
			'single'        => true,
			'type'          => 'string',
			'default'       => '[]',
			'auth_callback' => $auth,
		] );
		register_post_meta( $pt, '_azm_format', [
			'show_in_rest'  => true,
			'single'        => true,
			'type'          => 'string',
			'default'       => 'mini-zine',
			'auth_callback' => $auth,
		] );
	}
}

// ---------- Save Meta ----------

add_action( 'save_post', 'azm_save_meta', 10, 2 );
function azm_save_meta( $post_id, $post ) {
	if ( ! isset( $_POST['azm_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['azm_nonce'] ) ), 'azm_save_zine' ) ) return;
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
	if ( ! current_user_can( 'edit_post', $post_id ) ) return;

	if ( isset( $_POST['azm_pages'] ) ) {
		$pages = wp_unslash( $_POST['azm_pages'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- JSON blob; structure is validated by json_decode on the next line.
		$decoded = json_decode( $pages );
		if ( $decoded !== null ) {
			update_post_meta( $post_id, '_azm_pages', wp_slash( $pages ) );
		}
	}
	if ( isset( $_POST['azm_format'] ) ) {
		$format = sanitize_text_field( wp_unslash( $_POST['azm_format'] ) );
		if ( in_array( $format, [ 'mini-zine', 'a5-booklet' ], true ) ) {
			update_post_meta( $post_id, '_azm_format', $format );
		}
	}
}

// ---------- Enqueue Admin Assets ----------

add_action( 'admin_enqueue_scripts', 'azm_admin_assets' );
function azm_admin_assets( $hook ) {
	$screen = get_current_screen();
	if ( ! $screen || ! in_array( $screen->post_type, [ 'post', 'page', 'zine' ], true ) ) return;

	wp_enqueue_media();
	wp_enqueue_style( 'azm-admin', AZM_URL . 'assets/css/admin.css', [], AZM_VERSION );
	wp_enqueue_script( 'azm-admin', AZM_URL . 'assets/js/admin.js', [], AZM_VERSION, true );

	wp_localize_script( 'azm-admin', 'AZM', [
		'restUrl'        => rest_url( 'azm/v1/' ),
		'nonce'          => wp_create_nonce( 'wp_rest' ),
		'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
		'uploadDir'      => wp_upload_dir()['baseurl'],
		'hasAnthropicKey'=> ! empty( get_option( 'azm_anthropic_key', '' ) ),
		'hasOpenAIKey'   => ! empty( get_option( 'azm_openai_key', '' ) ),
		'settingsUrl'    => admin_url( 'options-general.php?page=azm-settings' ),
	] );
}

// ---------- REST API ----------

add_action( 'rest_api_init', 'azm_register_routes' );
function azm_register_routes() {
	register_rest_route( 'azm/v1', '/generate-copy', [
		'methods'             => 'POST',
		'callback'            => 'azm_generate_copy',
		'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
	] );
	register_rest_route( 'azm/v1', '/generate-image', [
		'methods'             => 'POST',
		'callback'            => 'azm_generate_image',
		'permission_callback' => function() { return current_user_can( 'edit_posts' ); },
	] );
}

function azm_generate_copy( WP_REST_Request $req ) {
	$provider  = sanitize_text_field( $req->get_param( 'provider' ) ?: 'anthropic' );
	$prompt    = sanitize_textarea_field( $req->get_param( 'prompt' ) );
	$context   = sanitize_textarea_field( $req->get_param( 'context' ) );
	$type      = sanitize_text_field( $req->get_param( 'type' ) ); // title | body | quote

	$type_map = [
		'title' => 'Write a punchy, evocative zine page title (max 8 words). No punctuation at the end.',
		'body'  => 'Write a short zine page body text (2–4 sentences). Voice: personal, direct, a little raw.',
		'quote' => 'Write a bold pull quote for a zine (max 20 words). Make it memorable and striking.',
	];
	$instruction = $type_map[ $type ] ?? $type_map['body'];
	$user_message = "{$instruction}\n\nContext/topic: {$prompt}\n\nExisting zine context: {$context}";

	if ( $provider === 'openai' ) {
		$api_key = get_option( 'azm_openai_key', '' );
		if ( ! $api_key ) {
			return new WP_Error( 'no_key', 'OpenAI API key not configured. Visit Zines > Settings.', [ 'status' => 400 ] );
		}
		$response = wp_remote_post( 'https://api.openai.com/v1/chat/completions', [
			'timeout' => 30,
			'headers' => [
				'Authorization' => 'Bearer ' . $api_key,
				'Content-Type'  => 'application/json',
			],
			'body' => wp_json_encode( [
				'model'      => 'gpt-4o-mini',
				'max_tokens' => 300,
				'messages'   => [
					[ 'role' => 'system', 'content' => 'You write punchy, creative zine copy. Be brief and bold.' ],
					[ 'role' => 'user',   'content' => $user_message ],
				],
			] ),
		] );
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'api_error', $response->get_error_message(), [ 'status' => 500 ] );
		}
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		$text = $body['choices'][0]['message']['content'] ?? '';
	} else {
		$api_key = get_option( 'azm_anthropic_key', '' );
		if ( ! $api_key ) {
			return new WP_Error( 'no_key', 'Anthropic API key not configured. Visit Zines > Settings.', [ 'status' => 400 ] );
		}
		$response = wp_remote_post( 'https://api.anthropic.com/v1/messages', [
			'timeout' => 30,
			'headers' => [
				'x-api-key'         => $api_key,
				'anthropic-version' => '2023-06-01',
				'content-type'      => 'application/json',
			],
			'body' => wp_json_encode( [
				'model'      => 'claude-haiku-4-5-20251001',
				'max_tokens' => 300,
				'messages'   => [ [ 'role' => 'user', 'content' => $user_message ] ],
			] ),
		] );
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'api_error', $response->get_error_message(), [ 'status' => 500 ] );
		}
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		$text = $body['content'][0]['text'] ?? '';
	}

	if ( ! $text ) {
		return new WP_Error( 'empty', 'No content returned from AI.', [ 'status' => 500 ] );
	}

	return rest_ensure_response( [ 'text' => trim( $text ) ] );
}

function azm_image_metadata( string $prompt ): array {
	$instruction = "An AI image was generated from this prompt: \"{$prompt}\"\n\nReply with JSON only, no other text:\n{\"title\": \"<concise 4-7 word title in Title Case>\", \"alt\": \"<1-2 sentence accessibility description of what the image depicts>\"}";

	$anthropic_key = get_option( 'azm_anthropic_key', '' );
	if ( $anthropic_key ) {
		$r = wp_remote_post( 'https://api.anthropic.com/v1/messages', [
			'timeout' => 20,
			'headers' => [
				'x-api-key'         => $anthropic_key,
				'anthropic-version' => '2023-06-01',
				'content-type'      => 'application/json',
			],
			'body' => wp_json_encode( [
				'model'      => 'claude-haiku-4-5-20251001',
				'max_tokens' => 150,
				'messages'   => [ [ 'role' => 'user', 'content' => $instruction ] ],
			] ),
		] );
		if ( ! is_wp_error( $r ) ) {
			$data = json_decode( trim( json_decode( wp_remote_retrieve_body( $r ), true )['content'][0]['text'] ?? '{}' ), true );
			if ( ! empty( $data['title'] ) && ! empty( $data['alt'] ) ) return $data;
		}
	}

	$openai_key = get_option( 'azm_openai_key', '' );
	if ( $openai_key ) {
		$r = wp_remote_post( 'https://api.openai.com/v1/chat/completions', [
			'timeout' => 20,
			'headers' => [ 'Authorization' => 'Bearer ' . $openai_key, 'Content-Type' => 'application/json' ],
			'body'    => wp_json_encode( [
				'model'      => 'gpt-4o-mini',
				'max_tokens' => 150,
				'messages'   => [
					[ 'role' => 'system', 'content' => 'Generate image titles and alt text. Reply with JSON only.' ],
					[ 'role' => 'user',   'content' => $instruction ],
				],
			] ),
		] );
		if ( ! is_wp_error( $r ) ) {
			$data = json_decode( trim( json_decode( wp_remote_retrieve_body( $r ), true )['choices'][0]['message']['content'] ?? '{}' ), true );
			if ( ! empty( $data['title'] ) && ! empty( $data['alt'] ) ) return $data;
		}
	}

	return [
		'title' => ucwords( wp_trim_words( $prompt, 6, '' ) ),
		'alt'   => $prompt,
	];
}

function azm_generate_image( WP_REST_Request $req ) {
	$api_key = get_option( 'azm_openai_key', '' );
	if ( ! $api_key ) {
		return new WP_Error( 'no_key', 'OpenAI API key not configured. Visit Zines > Settings.', [ 'status' => 400 ] );
	}

	$prompt          = sanitize_textarea_field( $req->get_param( 'prompt' ) );
	$previous_prompt = sanitize_textarea_field( $req->get_param( 'previousPrompt' ) );
	$post_id         = absint( $req->get_param( 'postId' ) );

	$full_prompt = $previous_prompt
		? "Zine illustration, risograph-style, bold graphic, lo-fi aesthetic. Previous version was: \"{$previous_prompt}\". Refined version: {$prompt}"
		: "Zine illustration, risograph-style, bold graphic, lo-fi aesthetic: {$prompt}";

	$response = wp_remote_post( 'https://api.openai.com/v1/images/generations', [
		'timeout' => 120,
		'headers' => [
			'Authorization' => 'Bearer ' . $api_key,
			'Content-Type'  => 'application/json',
		],
		'body' => wp_json_encode( [
			'model'   => 'gpt-image-1',
			'prompt'  => $full_prompt,
			'n'       => 1,
			'size'    => '1024x1024',
			'quality' => 'medium',
		] ),
	] );

	if ( is_wp_error( $response ) ) {
		return new WP_Error( 'api_error', $response->get_error_message(), [ 'status' => 500 ] );
	}

	$body = json_decode( wp_remote_retrieve_body( $response ), true );
	$b64  = $body['data'][0]['b64_json'] ?? '';

	if ( ! $b64 ) {
		$api_err = $body['error']['message'] ?? 'No image returned from AI.';
		return new WP_Error( 'empty', $api_err, [ 'status' => 500 ] );
	}

	// Decode and save directly to the media library.
	$image_data = base64_decode( $b64 );
	$filename   = 'zine-ai-' . time() . '.png';
	$upload     = wp_upload_bits( $filename, null, $image_data );

	if ( ! empty( $upload['error'] ) ) {
		return new WP_Error( 'upload_error', $upload['error'], [ 'status' => 500 ] );
	}

	require_once ABSPATH . 'wp-admin/includes/image.php';

	$meta  = azm_image_metadata( $prompt );
	$title = sanitize_text_field( $meta['title'] );
	$alt   = sanitize_text_field( $meta['alt'] );

	$attachment_id = wp_insert_attachment( [
		'post_mime_type' => 'image/png',
		'post_title'     => $title,
		'post_status'    => 'inherit',
	], $upload['file'], $post_id ?: 0 );

	if ( ! is_wp_error( $attachment_id ) ) {
		wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );
		update_post_meta( $attachment_id, '_wp_attachment_image_alt', $alt );
	}

	return rest_ensure_response( [ 'url' => $upload['url'] ] );
}

// ---------- Settings Page ----------

add_action( 'admin_menu', 'azm_settings_menu' );
function azm_settings_menu() {
	add_options_page( 'Zine Maker Settings', 'Zine Maker', 'manage_options', 'azm-settings', 'azm_settings_page' );
}

add_action( 'admin_init', 'azm_register_settings' );
function azm_register_settings() {
	register_setting( 'azm_settings', 'azm_anthropic_key', [ 'sanitize_callback' => 'sanitize_text_field' ] );
	register_setting( 'azm_settings', 'azm_openai_key',    [ 'sanitize_callback' => 'sanitize_text_field' ] );
}

function azm_settings_page() {
	?>
	<div class="wrap azm-settings-wrap">
		<h1>AI Zine Maker — Settings</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'azm_settings' ); ?>
			<table class="form-table">
				<tr>
					<th><label for="azm_anthropic_key">Anthropic API Key <span style="font-weight:400;opacity:.6">(optional)</span></label></th>
					<td>
						<input type="password" id="azm_anthropic_key" name="azm_anthropic_key"
							value="<?php echo esc_attr( get_option( 'azm_anthropic_key', '' ) ); ?>"
							class="regular-text" autocomplete="off" />
						<p class="description">Used for AI text generation via Claude. If you only have an OpenAI key, that works for text too.</p>
					</td>
				</tr>
				<tr>
					<th><label for="azm_openai_key">OpenAI API Key <span style="font-weight:400;opacity:.6">(optional)</span></label></th>
					<td>
						<input type="password" id="azm_openai_key" name="azm_openai_key"
							value="<?php echo esc_attr( get_option( 'azm_openai_key', '' ) ); ?>"
							class="regular-text" autocomplete="off" />
						<p class="description">Used for AI illustration generation via DALL-E 3, and for AI text generation via GPT if no Anthropic key is set.</p>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Save Settings' ); ?>
		</form>
	</div>
	<?php
}

// ---------- Zine Block ----------

add_action( 'init', 'azm_register_block' );
function azm_register_block() {
	if ( ! function_exists( 'register_block_type' ) ) return;

	wp_register_script(
		'azm-zine-block',
		AZM_URL . 'assets/js/zine-block.js',
		[ 'wp-blocks', 'wp-element', 'wp-block-editor' ],
		AZM_VERSION,
		true
	);
	wp_register_style(
		'azm-zine-block-editor',
		AZM_URL . 'assets/css/zine-block-editor.css',
		[ 'wp-edit-blocks' ],
		AZM_VERSION
	);

	register_block_type( 'azm/zine', [
		'editor_script'   => 'azm-zine-block',
		'editor_style'    => 'azm-zine-block-editor',
		'render_callback' => 'azm_render_zine_block',
	] );
}

function azm_render_zine_block( $attrs, $content, $block ) {
	if ( ! is_singular() ) return '';

	$post_id   = get_the_ID();
	$raw_pages = get_post_meta( $post_id, '_azm_pages', true ) ?: '[]';
	$format    = get_post_meta( $post_id, '_azm_format', true ) ?: 'mini-zine';
	$pages     = json_decode( $raw_pages, true );

	if ( empty( $pages ) ) return '';

	wp_enqueue_style( 'azm-frontend', AZM_URL . 'assets/css/frontend.css', [], AZM_VERSION );
	wp_enqueue_script( 'azm-frontend', AZM_URL . 'assets/js/frontend.js', [], AZM_VERSION, true );

	wp_localize_script( 'azm-frontend', 'AZM_ZINE', [
		'pages'  => $pages,
		'format' => $format,
		'title'  => get_the_title( $post_id ),
	] );

	ob_start();
	include AZM_PATH . 'templates/zine-display.php';
	return ob_get_clean();
}

// Pre-populate new zine posts with the block so users can add blocks above/below it.
add_filter( 'default_content', 'azm_default_post_content', 10, 2 );
function azm_default_post_content( $content, $post ) {
	if ( $post->post_type === 'zine' ) {
		return '<!-- wp:azm/zine /-->';
	}
	return $content;
}

// ---------- Frontend Display ----------

// Prevent WordPress from auto-generating an excerpt from the zine HTML.
// Only show the excerpt if the author has explicitly written one.
add_filter( 'get_the_excerpt', 'azm_suppress_auto_excerpt', 10, 2 );
function azm_suppress_auto_excerpt( $excerpt, $post ) {
	if ( $post->post_type === 'zine' && empty( $post->post_excerpt ) ) {
		return '';
	}
	return $excerpt;
}

// Fallback for existing zines that pre-date the block (no wp:azm/zine in their content).
add_filter( 'the_content', 'azm_render_frontend' );
function azm_render_frontend( $content ) {
	if ( ! is_singular( 'zine' ) ) return $content;
	if ( has_block( 'azm/zine' ) ) return $content;

	$post_id = get_the_ID();
	$pages   = json_decode( get_post_meta( $post_id, '_azm_pages', true ) ?: '[]', true );

	if ( empty( $pages ) ) return $content;

	wp_enqueue_style( 'azm-frontend', AZM_URL . 'assets/css/frontend.css', [], AZM_VERSION );
	wp_enqueue_script( 'azm-frontend', AZM_URL . 'assets/js/frontend.js', [], AZM_VERSION, true );

	$raw_pages = get_post_meta( $post_id, '_azm_pages', true ) ?: '[]';
	wp_localize_script( 'azm-frontend', 'AZM_ZINE', [
		'pages'  => json_decode( $raw_pages, true ) ?: [],
		'format' => get_post_meta( $post_id, '_azm_format', true ) ?: 'mini-zine',
		'title'  => get_the_title( $post_id ),
	] );

	ob_start();
	include AZM_PATH . 'templates/zine-display.php';
	return ob_get_clean();
}

// ---------- Flush Rewrite on Activation ----------

register_activation_hook( __FILE__, function() {
	azm_register_cpt();
	flush_rewrite_rules();
} );
