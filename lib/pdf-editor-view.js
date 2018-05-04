"use babel";

let {$, ScrollView} = require('atom-space-pen-views');
let {Point} = require('atom');
let fs = require('fs-plus');
let path = require('path');
let _ = require('underscore-plus');
let {File, Disposable, CompositeDisposable} = require('atom');
let {Function} = require('loophole');
global.Function = Function;

global.PDFJS = {workerSrc: "temp", cMapUrl:"temp", cMapPacked:true};
require('./../node_modules/pdfjs-dist/build/pdf.js');
PDFJS.workerSrc = "file://" + path.resolve(__dirname, "../node_modules/pdfjs-dist/build/pdf.worker.js");
PDFJS.cMapUrl = "file://" + path.resolve(__dirname, "../node_modules/pdfjs-dist/cmaps")+"/";
let {exec, execFile} = require('child_process');

export default class PdfEditorView extends ScrollView {
  static content() {
    this.div({class: 'pdf-view', tabindex: -1}, () => {
      this.div({outlet: 'container', style: 'position: relative'});
    });
  }

  constructor(filePath, scale = null, scrollTop = 0, scrollLeft = 0) {
    super();

    this.currentScale = scale ? scale : 1.5;
    this.defaultScale = 1.5;
    this.scaleFactor = 10.0;
    this.fitToWidthOnOpen = !scale && atom.config.get('pdf-view.fitToWidthOnOpen');

    this.filePath = filePath;
    this.file = new File(this.filePath);
    this.scrollTopBeforeUpdate = scrollTop;
    this.scrollLeftBeforeUpdate = scrollLeft;
    this.canvases = [];
    this.updating = false;

    this.updatePdf(true);

    this.pdfViewElements = [];
    this.binaryViewEditor = null;

    this.currentPageNumber = 0;
    this.totalPageNumber = 0;
    this.centersBetweenPages = [];
    this.pageHeights = [];
    this.maxPageWidth = 0;
    this.toScaleFactor = 1.0;
    this.dragging = null;

    let disposables = new CompositeDisposable();

    let needsUpdateCallback = () => {
      if (this.updating) {
        this.needsUpdate = true;
      } else {
        this.updatePdf();
      }
    }

    let toggleNightModeCallback = () => {
      this.setNightMode();
    }

    disposables.add(atom.config.onDidChange('pdf-view.nightMode', toggleNightModeCallback));
    disposables.add(atom.config.onDidChange('pdf-view.reverseSyncBehaviour', needsUpdateCallback));

    disposables.add(this.file.onDidChange(() => {
      if (atom.config.get('pdf-view.autoReloadOnUpdate')) {
        needsUpdateCallback();
      } else {
        this.fileUpdated = true;
      }
    }));

    let autoReloadDisposable;
    let setupAutoReload = () => {
      if (!atom.config.get('pdf-view.autoReloadOnUpdate')) {
        autoReloadDisposable = atom.workspace.onDidOpen((e) => {
          if (e.item == this && this.fileUpdated) {
            this.fileUpdated = false;
            needsUpdateCallback();
          }
        });
      } else {
        if(autoReloadDisposable) {
          disposables.remove(autoReloadDisposable);
          autoReloadDisposable.dispose();
        }

        if (this.fileUpdated) {
          this.fileUpdated = false;
          needsUpdateCallback();
        }
      }
    }
    disposables.add(atom.config.observe('pdf-view.autoReloadOnUpdate', setupAutoReload));

    let moveLeftCallback = (() => this.scrollLeft(this.scrollLeft() - $(window).width() / 20));
    let moveRightCallback = (() => this.scrollRight(this.scrollRight() + $(window).width() / 20));
    let scrollCallback = (() => this.onScroll());
    let resizeHandler = (() => this.setCurrentPageNumber());

    atom.commands.add('.pdf-view', {
      'core:move-left': moveLeftCallback,
      'core:move-right': moveRightCallback
    });

    this.on('scroll', scrollCallback);
    $(window).on('resize', resizeHandler);
    
    disposables.add(new Disposable(() => {
      $(window).off('scroll', scrollCallback);
      $(window).off('resize', resizeHandler);
    }));

    atom.commands.add('atom-workspace', {
      'pdf-view:zoom-fit': () => {
        if (this.hasFocus()) {
          this.zoomFit();
        }
      },
      'pdf-view:zoom-in': () => {
        if (this.hasFocus()) {
          this.zoomIn();
        }
      },
      'pdf-view:zoom-out': () => {
        if (this.hasFocus()) {
          this.zoomOut();
        }
      },
      'pdf-view:reset-zoom': () => {
        if (this.hasFocus()) {
          this.resetZoom();
        }
      },
      'pdf-view:go-to-next-page': () => {
        if (this.hasFocus()) {
          this.goToNextPage();
        }
      },
      'pdf-view:go-to-previous-page': () => {
        if (this.hasFocus()) {
          this.goToPreviousPage();
        }
      },
      'pdf-view:reload': () => {
        this.updatePdf(true);
      }
    });

    this.onMouseMove = (e) => {
      if (this.binaryView) {
        return;
      }
      if (this.dragging) {
        this.simpleClick = false;

        this.scrollTop(this.dragging.scrollTop - (e.screenY - this.dragging.y));
        this.scrollLeft(this.dragging.scrollLeft - (e.screenX - this.dragging.x));
        e.preventDefault();
      }
    };

    this.onMouseUp = (e) => {
      if (this.binaryView) {
        return;
      }
      this.dragging = null;
      $(document).unbind('mousemove', this.onMouseMove);
      $(document).unbind('mouseup', this.onMouseUp);
      e.preventDefault();
    };

    this.on('mousedown', (e) => {
      if (this.binaryView) {
        return;
      }
      this.simpleClick = true;
      atom.workspace.paneForItem(this).activate();
      this.dragging = {x: e.screenX, y: e.screenY, scrollTop: this.scrollTop(), scrollLeft: this.scrollLeft()};
      $(document).on('mousemove', this.onMouseMove);
      $(document).on('mouseup', this.onMouseUp);
      e.preventDefault();
    });

    this.on('mousewheel', (e) => {
      if (this.binaryView) {
        return;
      }
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.originalEvent.wheelDelta > 0) {
          this.zoomIn();
        } else if (e.originalEvent.wheelDelta < 0) {
          this.zoomOut();
        }
      }
    });
  }

  get binaryView() {
    return this.hasClass('binary-view');
  }

  set binaryView(enabled) {
    const container = this.container[0];
    if (!!enabled === this.binaryView) {
      return;
    }
    if (!this.binaryViewEditor) {
      const {TextBuffer, TextEditor} = require('atom');
      const buffer = TextBuffer.loadSync(this.filePath);
      this.binaryViewEditor = new TextEditor({buffer, readOnly: true});
    }
    if (enabled) {
      this.addClass('binary-view');
      for (const el of Array.from(container.children)) {
        container.removeChild(el);
        this.pdfViewElements.push(el);
      }
      container.appendChild(this.binaryViewEditor.element);
    }
    else {
      this.removeClass('binary-view');
      container.removeChild(this.binaryViewEditor.element);
      while (this.pdfViewElements.length) {
        container.appendChild(this.pdfViewElements.shift());
      }
    }
  }

  hasFocus() {
    return !this.binaryView && atom.workspace.getActivePaneItem() === this;
  }

  setNightMode() {
    if (atom.config.get('pdf-view.nightMode')) {
      this.addClass('night-mode');
    } else {
      this.removeClass('night-mode');
    }
  }

  reverseSync(page, e) {
    if (this.simpleClick) {
      e.preventDefault();
      this.pdfDocument.getPage(page).then((pdfPage) => {
        let viewport = pdfPage.getViewport(this.currentScale);
        let x,y;
        [x,y] = viewport.convertToPdfPoint(e.offsetX, $(this.canvases[page - 1]).height() - e.offsetY);

        let callback = ((error, stdout, stderr) => {
          if (!error) {
            stdout = stdout.replace(/\r\n/g, '\n');
            let attrs = {};
            for (let line of stdout.split('\n')) {
              let m = line.match(/^([a-zA-Z]*):(.*)$/)
              if (m) {
                attrs[m[1]] = m[2];
              }
            }

            let file = attrs.Input;
            let line = attrs.Line;

            if (file && line) {
              let editor = null;
              let pathToOpen = path.normalize(attrs.Input);
              let lineToOpen = +attrs.Line;
              let done = false;
              for (let editor of atom.workspace.getTextEditors()) {
                if (editor.getPath() === pathToOpen) {
                  let position = new Point(lineToOpen-1, -1);
                  editor.scrollToBufferPosition(position, {center: true});
                  editor.setCursorBufferPosition(position);
                  editor.moveToFirstCharacterOfLine();
                  let pane = atom.workspace.paneForItem(editor);
                  pane.activateItem(editor);
                  pane.activate();
                  done = true;
                  break;
                }
              }

              if (!done) {
                let paneopt = atom.config.get('pdf-view.paneToUseInSynctex')
                atom.workspace.open(pathToOpen, {initialLine: lineToOpen, initialColumn: 0, split: paneopt})
              }
            }
          }
        });

        let synctexPath = atom.config.get('pdf-view.syncTeXPath');
        let clickspec = [page, x, y, this.filePath].join(':');

        if (synctexPath) {
          execFile(synctexPath, ["edit", "-o", clickspec], callback);
        } else {
          let cmd = `synctex edit -o "${clickspec}"`;
          exec(cmd, callback);
        }
      });
    }
  }

  forwardSync(texPath, lineNumber) {
      if (this.updating) {
        this.forwardSyncAfterUpdate = {
          texPath,
          lineNumber
        }
        return
      }

      let callback = ((error, stdout, stderr) => {
        if (!error) {
          stdout = stdout.replace(/\r\n/g, '\n');
          let attrs = {};
          for (let line of stdout.split('\n')) {
            let m = line.match(/^([a-zA-Z]*):(.*)$/)
            if (m) {
              if (m[1] in attrs) {
                break;
              }

              attrs[m[1]] = m[2];
            }
          }

          let page = parseInt(attrs.Page);

          if (!this.pdfDocument) {
            return;
          }

          if (page > this.pdfDocument.numPages) {
            return;
          }

          this.pdfDocument.getPage(page).then((pdfPage) => {
            let viewport = pdfPage.getViewport(this.currentScale);
            let canvas = this.canvases[page - 1];

            let x = parseFloat(attrs.x);
            let y = parseFloat(attrs.y);
            [x, y] = viewport.convertToViewportPoint(x, y);

            x = x + canvas.offsetLeft;
            y = viewport.height - y + canvas.offsetTop;

            let visibilityThreshold = 50;

            // Scroll
            if (y < this.scrollTop() + visibilityThreshold) {
              this.scrollTop(y - visibilityThreshold);
            } else if (y > this.scrollBottom() - visibilityThreshold) {
              this.scrollBottom(y + visibilityThreshold);
            }

            if (x < this.scrollLeft() + visibilityThreshold) {
              this.scrollLeft(x - visibilityThreshold);
            } else if (x > this.scrollRight() - visibilityThreshold) {
              this.scrollBottom(x + visibilityThreshold);
            }

            // Show highlighter
            $('<div/>', {
              class: "tex-highlight",
              style: `top: ${y}px; left: ${x}px;`
            })
            .appendTo(this.container)
            .on('animationend', function() {
              $(this).remove();
            });
          });
        }
      });

      let synctexPath = atom.config.get('pdf-view.syncTeXPath');
      let inputspec = [lineNumber, 0, texPath].join(':');

      if (synctexPath) {
        execFile(synctexPath, ["view", "-i", inputspec, "-o", this.filePath], callback);
      } else {
        let cmd = `synctex view -i "${inputspec}" -o "${this.filePath}"`;
        exec(cmd, callback);
      }
  }


  onScroll() {
    if (this.binaryView) {
      return;
    }

    if (!this.updating) {
      this.scrollTopBeforeUpdate = this.scrollTop();
      this.scrollLeftBeforeUpdate = this.scrollLeft();
    }

    this.setCurrentPageNumber();
  }

  setCurrentPageNumber() {
    if (!this.pdfDocument || this.binaryView) {
      return;
    }

    let center = (this.scrollBottom() + this.scrollTop())/2.0
    this.currentPageNumber = 1

    if (this.centersBetweenPages.length === 0 && this.pageHeights.length === this.pdfDocument.numPages)
      for (let pdfPageNumber of _.range(1, this.pdfDocument.numPages+1)) {
        this.centersBetweenPages.push(this.pageHeights.slice(0, pdfPageNumber).reduce(((x,y) => x + y), 0) + pdfPageNumber * 20 - 10);
      }

    for (let pdfPageNumber of _.range(2, this.pdfDocument.numPages+1)) {
      if (center >= this.centersBetweenPages[pdfPageNumber-2] && center < this.centersBetweenPages[pdfPageNumber-1]) {
        this.currentPageNumber = pdfPageNumber;
      }
    }

    atom.views.getView(atom.workspace).dispatchEvent(new Event('pdf-view:current-page-update'));
  }

  finishUpdate() {
    this.updating = false;
    if (this.needsUpdate) {
      this.updatePdf();
    }
    if (this.toScaleFactor != 1) {
      this.adjustSize(1);
    }
    if (this.scrollToPageAfterUpdate) {
      this.scrollToPage(this.scrollToPageAfterUpdate)
      delete this.scrollToPageAfterUpdate
    }
    if (this.scrollToNamedDestAfterUpdate) {
      this.scrollToNamedDest(this.scrollToNamedDestAfterUpdate)
      delete this.scrollToNamedDestAfterUpdate
    }
    if (this.forwardSyncAfterUpdate) {
      this.forwardSync(this.forwardSyncAfterUpdate.texPath, this.forwardSyncAfterUpdate.lineNumber)
      delete this.forwardSyncAfterUpdate
    }
  }

  updatePdf(closeOnError = false) {
    this.needsUpdate = false;

    if (!fs.existsSync(this.filePath)) {
      return;
    }

    let pdfData = null;

    try {
      pdfData = new Uint8Array(fs.readFileSync(this.filePath));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
    }

    this.updating = true;

    let reverseSyncClicktype = null
    switch(atom.config.get('pdf-view.reverseSyncBehaviour')) {
      case 'Click':
        reverseSyncClicktype = 'click'
        break
      case 'Double click':
        reverseSyncClicktype = 'dblclick'
        break
    }

    this.setNightMode();

    PDFJS.getDocument(pdfData).then((pdfDocument) => {
      this.container.find("canvas").remove();
      this.canvases = [];
      this.pageHeights = [];

      this.pdfDocument = pdfDocument;
      this.totalPageNumber = this.pdfDocument.numPages;

      for (let pdfPageNumber of _.range(1, this.pdfDocument.numPages+1)) {
        let canvas = $("<canvas/>", {class: "page-container"}).appendTo(this.container)[0];
        this.canvases.push(canvas);
        this.pageHeights.push(0);
        if (reverseSyncClicktype) {
          $(canvas).on(reverseSyncClicktype, (e) => this.reverseSync(pdfPageNumber, e));
        }
      }

      this.maxPageWidth = 0;

      if (this.fitToWidthOnOpen) {
        Promise.all(
          _.range(1, this.pdfDocument.numPages + 1).map((pdfPageNumber) =>
            this.pdfDocument.getPage(pdfPageNumber).then((pdfPage) =>
              pdfPage.getViewport(1.0).width
            )
          )
        ).then((pdfPageWidths) => {
          this.maxPageWidth = Math.max(...pdfPageWidths);
          this.renderPdf();
        })
      } else {
        this.renderPdf();
      }
    }, () => {
      if (closeOnError) {
        atom.notifications.addError(this.filePath + " is not a PDF file.");
        atom.workspace.paneForItem(this).destroyItem(this);
      } else {
        this.finishUpdate();
      }
    });
  }

  renderPdf(scrollAfterRender = true) {
    this.centersBetweenPages = [];

    if (this.fitToWidthOnOpen) {
      this.currentScale = this[0].clientWidth / this.maxPageWidth;
      this.fitToWidthOnOpen = false;
    }

    Promise.all(
      _.range(1, this.pdfDocument.numPages + 1).map((pdfPageNumber) => {
        let canvas = this.canvases[pdfPageNumber - 1];

        return this.pdfDocument.getPage(pdfPageNumber).then((pdfPage) => {
          let viewport = pdfPage.getViewport(this.currentScale);
          let context = canvas.getContext('2d');

          let outputScale = window.devicePixelRatio;
          canvas.height = Math.floor(viewport.height) * outputScale;
          canvas.width = Math.floor(viewport.width) * outputScale;

          context._scaleX = outputScale;
          context._scaleY = outputScale;
          context.scale(outputScale, outputScale);
          context._transformMatrix = [outputScale, 0, 0, outputScale, 0, 0];
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';

          this.pageHeights[pdfPageNumber - 1] = Math.floor(viewport.height);

          return pdfPage.render({canvasContext: context, viewport: viewport});
        });
      })
    ).then((renderTasks) => {
      if (scrollAfterRender) {
        this.scrollTop(this.scrollTopBeforeUpdate);
        this.scrollLeft(this.scrollLeftBeforeUpdate);
        this.setCurrentPageNumber();
      }
      Promise.all(renderTasks).then(() => this.finishUpdate());
    }, () => this.finishUpdate());
  }

  computeMaxPageWidthAndTryZoomFit(){
    Promise.all(
      _.range(1, this.pdfDocument.numPages + 1).map((pdfPageNumber) =>
        this.pdfDocument.getPage(pdfPageNumber).then((pdfPage) =>
          pdfPage.getViewport(1.0).width
        )
      )
    ).then((pdfPageWidths) => {
      this.maxPageWidth = Math.max(...pdfPageWidths);
      this.zoomFit();
    })
  }

  zoomFit() {
    if (this.maxPageWidth == 0) {
      this.computeMaxPageWidthAndTryZoomFit();
      return;
    }
    let fitScale = this[0].clientWidth / this.maxPageWidth;
    return this.adjustSize(fitScale / (this.currentScale *  this.toScaleFactor));
  }

  zoomOut() {
    return this.adjustSize(100 / (100 + this.scaleFactor));
  }

  zoomIn() {
    return this.adjustSize((100 + this.scaleFactor) / 100);
  }

  resetZoom() {
    return this.adjustSize(this.defaultScale / this.currentScale);
  }

  goToNextPage() {
    return this.scrollToPage(this.currentPageNumber + 1);
  }

  goToPreviousPage() {
    return this.scrollToPage(this.currentPageNumber - 1);
  }

  computeZoomedScrollTop(oldScrollTop, oldPageHeights) {
    let pixelsToZoom = 0;
    let spacesToSkip = 0;
    let zoomedPixels = 0;

    for (let pdfPageNumber of _.range(0, this.pdfDocument.numPages)) {
      if (pixelsToZoom + spacesToSkip + oldPageHeights[pdfPageNumber] > oldScrollTop) {
        zoomFactorForPage = this.pageHeights[pdfPageNumber] / oldPageHeights[pdfPageNumber];
        let partOfPageAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip);
        zoomedPixels += Math.round(partOfPageAboveUpperBorder * zoomFactorForPage);
        pixelsToZoom += partOfPageAboveUpperBorder;
        break;
      } else {
        pixelsToZoom += oldPageHeights[pdfPageNumber];
        zoomedPixels += this.pageHeights[pdfPageNumber];
      }

      if (pixelsToZoom + spacesToSkip + 20 > oldScrollTop) {
        let partOfPaddingAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip);
        spacesToSkip += partOfPaddingAboveUpperBorder;
        break;
      } else {
        spacesToSkip += 20;
      }
    }

    return zoomedPixels + spacesToSkip;
  }

  adjustSize(factor) {
    if (!this.pdfDocument) {
      return;
    }

    factor = this.toScaleFactor * factor;

    if (this.updating) {
      this.toScaleFactor = factor;
      return;
    }

    this.updating = true;
    this.toScaleFactor = 1;

    let oldScrollTop = this.scrollTop();
    let oldPageHeights = this.pageHeights.slice(0);
    this.currentScale = this.currentScale * factor;
    this.renderPdf(false);

    process.nextTick(() => {
      let newScrollTop = this.computeZoomedScrollTop(oldScrollTop, oldPageHeights);
      this.scrollTop(newScrollTop);
    });

    process.nextTick(() => {
      let newScrollLeft = this.scrollLeft() * factor;
      this.scrollLeft(newScrollLeft);
    });
  }

  getCurrentPageNumber() {
    return this.currentPageNumber;
  }

  getTotalPageNumber() {
    return this.totalPageNumber;
  }

  scrollToPage(pdfPageNumber) {
    if (this.updating) {
      this.scrollToPageAfterUpdate = pdfPageNumber
      return
    }

    if (!this.pdfDocument || isNaN(pdfPageNumber)) {
      return;
    }

    pdfPageNumber = Math.min(pdfPageNumber, this.pdfDocument.numPages);
    pageScrollPosition = (this.pageHeights.slice(0, (pdfPageNumber-1)).reduce(((x,y) => x+y), 0)) + (pdfPageNumber - 1) * 20

    return this.scrollTop(pageScrollPosition);
  }

  scrollToNamedDest(namedDest) {
    if (this.updating) {
      this.scrollToNamedDestAfterUpdate = namedDest
      return
    }

    if (!this.pdfDocument) {
      return
    }

    this.pdfDocument.getDestination(namedDest)
      .then(destRef => this.pdfDocument.getPageIndex(destRef[0]))
      .then(pageNumber => this.scrollToPage(pageNumber + 1))
      .catch(() => atom.notifications.addError(`Cannot find named destination ${namedDest}.`))
  }

  serialize() {
    return {
      filePath: this.filePath,
      scale: this.currentScale,
      scrollTop: this.scrollTopBeforeUpdate,
      scrollLeft: this.scrollLeftBeforeUpdate,
      deserializer: 'PdfEditorDeserializer'
    };
  }

  getTitle() {
    if (this.filePath) {
      return path.basename(this.filePath);
    } else {
      return 'untitled';
    }
  }

  getURI() {
    return this.filePath;
  }

  getPath() {
    return this.filePath;
  }

  destroy() {
    return this.detach();
  }

  onDidChangeTitle() {
    return new Disposable(() => null);
  }

  onDidChangeModified() {
    return new Disposable(() => null);
  }
}
