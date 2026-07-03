=== AI Zine Maker ===
Contributors: tessneedham
Tags: zine, publisher, pdf, layout, canvas
Requires at least: 6.0
Tested up to: 7.0
Stable tag: 2.1.0
License: GPL v2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Create digital zines with a visual canvas editor. Export as folded mini-zines or A5 booklet PDFs.

== Description ==

AI Zine Maker provides a visual canvas editor for creating digital zines directly within WordPress. Build layouts with text, images, shapes, and freehand drawings across up to 8 pages. Export your zine as a print-ready PDF — either as a folded mini-zine (A4 landscape) or an A5 booklet.

Features:

* Drag-to-resize and reposition elements on a canvas
* Text styling — font family, size, bold, italic, colour, alignment
* Image placement with background-size and position controls
* Shape tools — rectangle and circle with optional stroke
* Freehand drawing tool
* PDF export — mini-zine (fold-and-cut) or A5 booklet formats
* Frontend reading experience with page-flip navigation

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/ai-zine-maker`, or install via the WordPress Plugins screen.
2. Activate the plugin through the Plugins screen in WordPress.
3. Go to **Zines → Add New** to create your first zine.

== Frequently Asked Questions ==

= What PDF formats are supported? =

**Mini-zine:** prints on a single A4 sheet (landscape), then fold and cut to make an 8-page pocket zine.

**A5 booklet:** prints on A4 sheets folded in half, suitable for saddle-stitched binding.

= How many pages can a zine have? =

Mini-zine format is fixed at 8 pages. A5 booklet format requires a multiple of 4 pages.

== Changelog ==

= 2.1.0 =
* Added AI Disclosure panel to zine editor (above Export & Share)
* Added AI Assisted / AI Generated badge options (replaces single checkbox)
* Badge renders on frontend above the Download PDF button
* Disclosure saves immediately via REST API on selection
* Pre-selects correct option when reopening a post
* Removed None option — disclosure is only shown when AI was used

= 2.0.0 =
* Removed AI text and image generation features
* Removed API key settings page
* Updated plugin description

= 1.3.6 =
* Improved PDF image quality — images now rendered via native canvas drawImage for lossless output
* Security hardening — escaping and sanitization aligned with WordPress coding standards
* Added GPL licence declaration

= 1.3.0 =
* PDF export rewritten with individual per-panel capture to eliminate cross-panel bleed
* Switched PDF image encoding from JPEG to PNG for lossless text rendering
* Thumbnail strip now scrolls and renders shapes, images, and rotated elements

= 1.0.0 =
* Initial release
