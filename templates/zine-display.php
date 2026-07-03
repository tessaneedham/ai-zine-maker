<?php
/**
 * Template: Zine frontend display.
 *
 * @package AiZineMaker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Migrate old layout-based page to element-based page.
if ( ! function_exists( 'azm_migrate_page_php' ) ) :
	/**
	 * Migrate legacy layout-based page to element-based format.
	 *
	 * @param array $page Page data array.
	 * @return array Normalised page array.
	 */
	function azm_migrate_page_php( $page ) {
		if ( isset( $page['elements'] ) && is_array( $page['elements'] ) ) {
			return $page;
		}
		$elements = array();
		$tc       = $page['textColor'] ?? '#1a1a1a';
		if ( ! empty( $page['title'] ) ) {
			$elements[] = array(
				'id'         => uniqid(),
				'type'       => 'text',
				'x'          => 8,
				'y'          => 8,
				'w'          => 84,
				'h'          => 18,
				'rotation'   => 0,
				'content'    => $page['title'],
				'fontFamily' => 'Georgia, serif',
				'fontSize'   => 22,
				'bold'       => true,
				'italic'     => false,
				'align'      => 'left',
				'color'      => $tc,
			);
		}
		if ( ! empty( $page['body'] ) ) {
			$elements[] = array(
				'id'         => uniqid(),
				'type'       => 'text',
				'x'          => 8,
				'y'          => 30,
				'w'          => 84,
				'h'          => 50,
				'rotation'   => 0,
				'content'    => $page['body'],
				'fontFamily' => 'Georgia, serif',
				'fontSize'   => 11,
				'bold'       => false,
				'italic'     => false,
				'align'      => 'left',
				'color'      => $tc,
			);
		}
		if ( ! empty( $page['imageUrl'] ) ) {
			$elements[] = array(
				'id'       => uniqid(),
				'type'     => 'image',
				'x'        => 8,
				'y'        => 8,
				'w'        => 84,
				'h'        => 60,
				'rotation' => 0,
				'url'      => $page['imageUrl'],
			);
		}
		return array(
			'id'       => $page['id'] ?? uniqid(),
			'bgColor'  => $page['bgColor'] ?? '#ffffff',
			'elements' => $elements,
		);
	}

endif;

$azm_pages = array_map( 'azm_migrate_page_php', $pages );
?>

<div class="azm-frontend-zine" id="azm-zine-<?php echo esc_attr( $post_id ); ?>">

	<div class="azm-zine-reader">
		<div class="azm-zine-pages" id="azm-zine-pages">
			<?php
			foreach ( $azm_pages as $i => $azm_page ) :
				$azm_bg   = isset( $azm_page['bgColor'] ) ? esc_attr( $azm_page['bgColor'] ) : '#ffffff';
				$elements = isset( $azm_page['elements'] ) ? $azm_page['elements'] : array();
				?>
			<div class="azm-zine-page" data-index="<?php echo absint( $i ); ?>">
				<div class="azm-zine-canvas" style="background:<?php echo esc_attr( $azm_bg ); ?>;">

				<?php
				foreach ( $elements as $elem ) :
					$azm_type  = isset( $elem['type'] ) ? $elem['type'] : '';
					$x         = (float) ( $elem['x'] ?? 0 );
					$y         = (float) ( $elem['y'] ?? 0 );
					$w         = (float) ( $elem['w'] ?? 100 );
					$h         = (float) ( $elem['h'] ?? 100 );
					$rot       = (float) ( $elem['rotation'] ?? 0 );
					$rot_style = $rot ? "transform:rotate({$rot}deg);transform-origin:center;" : '';
					$pos_style = "position:absolute;left:{$x}%;top:{$y}%;width:{$w}%;height:{$h}%;overflow:hidden;{$rot_style}";
					?>

					<?php
					if ( 'text' === $azm_type ) :
						$text_style = $pos_style
							. 'font-family:' . esc_attr( $elem['fontFamily'] ?? 'Georgia, serif' )
							. ';font-size:' . absint( $elem['fontSize'] ?? 14 ) . 'px'
							. ';font-weight:' . ( ! empty( $elem['bold'] ) ? 'bold' : 'normal' )
							. ';font-style:' . ( ! empty( $elem['italic'] ) ? 'italic' : 'normal' )
							. ';text-align:' . esc_attr( $elem['align'] ?? 'left' )
							. ';color:' . esc_attr( $elem['color'] ?? '#1a1a1a' )
							. ';line-height:1.4;word-break:break-word;';
						?>
					<div style="<?php echo esc_attr( $text_style ); ?>">
						<?php echo wp_kses( nl2br( esc_html( $elem['content'] ?? '' ) ), array( 'br' => array() ) ); ?>
					</div>

					<?php elseif ( 'image' === $azm_type && ! empty( $elem['url'] ) ) : ?>
					<div style="<?php echo esc_attr( $pos_style ); ?>background:url(<?php echo esc_url( $elem['url'] ); ?>) center/cover no-repeat;"></div>

						<?php
					elseif ( 'shape' === $azm_type ) :
						$sw        = (float) ( $elem['strokeWidth'] ?? 0 );
						$scol_esc  = esc_attr( $elem['strokeColor'] ?? '' );
						$br        = ( ( $elem['shapeType'] ?? 'rect' ) === 'circle' ) ? '50%' : '0%';
						$border    = ( $sw > 0 && $scol_esc ) ? 'border:' . $sw . 'px solid ' . $scol_esc . ';box-sizing:border-box;' : '';
						$shp_style = $pos_style . 'background:' . esc_attr( $elem['fill'] ?? '#cccccc' ) . ';border-radius:' . $br . ';' . $border;
						?>
					<div style="<?php echo esc_attr( $shp_style ); ?>"></div>

					<?php endif; ?>
				<?php endforeach; ?>

				<?php
				$drawings = $page['drawings'] ?? array();
				if ( ! empty( $drawings ) ) :
					?>
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;">
					<?php
					foreach ( $drawings as $stroke ) :
						$pts = $stroke['points'] ?? array();
						if ( empty( $pts ) ) {
							continue;
						}
						$color     = esc_attr( $stroke['color'] ?? '#000000' );
						$sw_draw   = floatval( $stroke['width'] ?? 3 ) * 0.3;
						$pts_str   = implode( ' ', array_map( fn( $p ) => floatval( $p['x'] ) . ',' . floatval( $p['y'] ), $pts ) );
						$xs        = array_column( $pts, 'x' );
						$ys        = array_column( $pts, 'y' );
						$bx        = min( $xs );
						$by        = min( $ys );
						$bw        = max( max( $xs ) - $bx, 0.001 );
						$bh        = max( max( $ys ) - $by, 0.001 );
						$cx        = $bx + $bw / 2;
						$cy        = $by + $bh / 2;
						$tx        = floatval( $stroke['tx'] ?? 0 );
						$ty        = floatval( $stroke['ty'] ?? 0 );
						$r         = floatval( $stroke['rotation'] ?? 0 );
						$sx        = isset( $stroke['scaleX'] ) ? floatval( $stroke['scaleX'] ) : 1;
						$sy        = isset( $stroke['scaleY'] ) ? floatval( $stroke['scaleY'] ) : 1;
						$tcx       = $cx + $tx;
						$tcy       = $cy + $ty;
						$transform = "translate({$tcx},{$tcy}) rotate({$r}) scale({$sx},{$sy}) translate(-{$cx},-{$cy})";
						?>
					<g transform="<?php echo esc_attr( $transform ); ?>">
						<polyline
							points="<?php echo esc_attr( $pts_str ); ?>"
							fill="none"
							stroke="<?php echo esc_attr( $color ); ?>"
							stroke-width="<?php echo esc_attr( (string) $sw_draw ); ?>"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</g>
					<?php endforeach; ?>
				</svg>
				<?php endif; ?>

				</div><!-- .azm-zine-canvas -->
			</div>
			<?php endforeach; ?>
		</div>

		<div class="azm-zine-controls">
			<button class="azm-nav-btn" id="azm-prev" aria-label="Previous page">&#8592;</button>
			<span class="azm-page-indicator" id="azm-page-indicator">1 / <?php echo count( $pages ); ?></span>
			<button class="azm-nav-btn" id="azm-next" aria-label="Next page">&#8594;</button>
		</div>

		<div class="azm-zine-actions">
			<?php
			$azm_badge_val = get_post_meta( $post_id, '_zf_ai_badge', true );
			if ( $azm_badge_val ) :
				$azm_badge_labels = array( 'assisted' => 'AI Assisted', 'generated' => 'AI Generated' );
				$azm_badge_label  = isset( $azm_badge_labels[ $azm_badge_val ] ) ? $azm_badge_labels[ $azm_badge_val ] : '';
				if ( $azm_badge_label ) :
					?>
			<div class="azm-ai-disclosure-badge"><?php echo esc_html( $azm_badge_label ); ?></div>
					<?php
				endif;
			endif;
			?>
			<button class="azm-download-btn" id="azm-download-pdf">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				Download PDF
			</button>
			<a class="azm-fold-link" href="<?php echo esc_url( home_url( '/folding-instructions/' ) ); ?>">
				How to fold &amp; cut
			</a>
		</div>
	</div>

</div>
