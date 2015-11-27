"use babel";

let {View} = require('atom-space-pen-views');
let {Disposable, CompositeDisposable} = require('atom');

export default class PdfStatusBarView extends View {
  static content() {
    this.div({class: 'status-image inline-block'}, () => {
      this.a({href: '#', class: 'pdf-status inline-block', outlet: 'pdfStatus'});
    });
  }

  constructor() {
    super();

    this.attach();

    let disposables = new CompositeDisposable();

    let updatePageCallback = () => {
      return this.updatePdfStatus();
    };

    disposables.add(atom.workspace.onDidChangeActivePaneItem(updatePageCallback));

    atom.views.getView(atom.workspace).addEventListener('pdf-view:current-page-update', updatePageCallback);

    disposables.add(new Disposable(() => window.removeEventListener('pdf-view:current-page-update', updatePageCallback)));

    let clickCallback = () => {
      atom.commands.dispatch(atom.views.getView(atom.workspace), 'pdf-view:go-to-page');
      return false;
    };

    let elem = this;

    elem.on('click', clickCallback);
    disposables.add(new Disposable(() => elem.off('click', clickCallback)));
  }

  attach() {
    let statusBar = document.querySelector("status-bar");

    if (statusBar != null) {
      this.statusBarTile = statusBar.addLeftTile({item: this, priority: 100});
    }
  }

  attached() {
    this.updatePdfStatus();
  }

  getPdfStatus(view) {
    this.pdfStatus.text(`Page: ${view.currentPageNumber}/${view.totalPageNumber}`).show();
  }

  updatePdfStatus() {
    let pdfView = atom.workspace.getActivePaneItem();

    if (pdfView != null && pdfView.pdfDocument != null) {
      this.getPdfStatus(pdfView);
    } else {
      this.pdfStatus.hide();
    }
  }
}
