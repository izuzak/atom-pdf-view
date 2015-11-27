"use babel";

let {$, TextEditorView, View} = require('atom-space-pen-views');
let {Disposable, CompositeDisposable} = require('atom');

export default class PdfGoToPageView extends View {
  static content() {
    return this.div({class: 'go-to-page'}, () => {
      this.subview('miniEditor', new TextEditorView({mini: true}));
      this.div({class: 'message', outlet: 'message'});
    })
  }

  constructor() {
    super();

    this.detaching = false;

    atom.commands.add('atom-workspace',
      {
        'pdf-view:go-to-page': () => {
          this.toggle();
          return false;
        }
      }
    );

    this.miniEditor.on('blur', () => this.close());

    atom.commands.add(this.element,
      {
        'core:confirm': () => this.confirm(),
        'core:cancel': () => this.close()
      }
    );

    this.miniEditor.preempt('textInput', (e) => {
      if (!e.originalEvent.data.match(/[0-9]/)) {
        return false;
      }
    });
  }

  toggle() {
    if (this.panel != null && this.panel.isVisible()) {
      return this.close();
    } else {
      return this.attach();
    }
  }

  close() {
    this.miniEditor.setText('');
    if (this.panel != null) {
      this.panel.hide();
    }
    atom.workspace.getActivePane().activate();
  }

  confirm() {
    let pageNumber = this.miniEditor.getText();
    pageNumber = parseInt(pageNumber, 10);
    let pdfView = atom.workspace.getActivePaneItem();

    this.close();

    if (pdfView != null && pdfView.pdfDocument != null && pdfView.scrollToPage != null) {
      pdfView.scrollToPage(pageNumber);
    }
  }

  attach() {
    let pdfView = atom.workspace.getActivePaneItem();

    if (pdfView != null && pdfView.pdfDocument != null && pdfView.scrollToPage != null) {
      this.panel = atom.workspace.addModalPanel({item: this});
      this.message.text(`Enter a page number 1-${pdfView.getTotalPageNumber()}`);
      this.miniEditor.focus();
    }
  }
}
