/* AI Zine Maker — Block Registration */
(function () {
  var el       = wp.element.createElement;
  var useProps = wp.blockEditor.useBlockProps;

  wp.blocks.registerBlockType('azm/zine', {
    title:    'Zine',
    icon:     'book-alt',
    category: 'media',
    supports: { html: false, multiple: false, reusable: false },

    edit: function () {
      return el('div', useProps({ className: 'azm-block-placeholder' }),
        el('span', { className: 'dashicons dashicons-book-alt', 'aria-hidden': 'true' }),
        el('span', {}, 'Zine Canvas — edit in the Zine Editor panel below')
      );
    },

    save: function () { return null; },
  });

  // Show the Zine Editor metabox only when the azm/zine block is in the post
  if (wp.data && wp.domReady) {
    wp.domReady(function () {
      var select    = wp.data.select;
      var subscribe = wp.data.subscribe;

      function containsZine(blocks) {
        return (blocks || []).some(function (b) {
          return b.name === 'azm/zine' || containsZine(b.innerBlocks);
        });
      }

      function syncMetabox(hasBlock) {
        var box = document.getElementById('azm_editor');
        if (box) box.style.display = hasBlock ? '' : 'none';
      }

      var prev;
      subscribe(function () {
        var has = containsZine(select('core/block-editor').getBlocks());
        if (has !== prev) {
          prev = has;
          syncMetabox(has);
        }
      });

      // Initial state
      syncMetabox(containsZine(select('core/block-editor').getBlocks()));
    });
  }
})();
