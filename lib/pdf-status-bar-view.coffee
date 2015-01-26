{View} = require 'atom-space-pen-views'
{Disposable, CompositeDisposable} = require 'atom'

module.exports =
class PdfStatusBarView extends View
  @content: ->
    @div class: 'status-image inline-block', =>
      @a href: '#', class: 'pdf-status inline-block', outlet: 'pdfStatus'

  initialize: ->
    @attach()

    disposables = new CompositeDisposable

    updatePageCallback = =>
      @updatePdfStatus()

    disposables.add atom.workspace.onDidChangeActivePaneItem updatePageCallback

    atom.views.getView(atom.workspace).addEventListener 'pdf-view:current-page-update', updatePageCallback

    disposables.add new Disposable ->
      window.removeEventListener 'pdf-view:current-page-update', updatePageCallback

    clickCallback = ->
      atom.commands.dispatch atom.views.getView(atom.workspace), 'pdf-view:go-to-page'
      false

    elem = this
    elem.on 'click', clickCallback
    disposables.add new Disposable ->
      elem.off 'click', clickCallback

  attach: ->
    statusBar = document.querySelector("status-bar")
    if statusBar?
      @statusBarTile = statusBar.addLeftTile(item: this, priority: 100)

  attached: ->
    @updatePdfStatus()

  getPdfStatus: (view) ->
    @pdfStatus.text("Page: #{view.currentPageNumber}/#{view.totalPageNumber}").show()

  updatePdfStatus: ->
    pdfView = atom.workspace.getActivePaneItem()

    if pdfView and pdfView.pdfDocument
      @getPdfStatus(pdfView)
    else
      @pdfStatus.hide()
