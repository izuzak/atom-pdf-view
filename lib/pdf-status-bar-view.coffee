{View} = require 'atom'

module.exports =
class PdfStatusBarView extends View
  @content: ->
    @div class: 'status-image inline-block', =>
      @span class: 'pdf-status', outlet: 'pdfStatus'

  initialize: (@statusBar) ->
    @attach()

    @subscribe atom.workspaceView, 'pane-container:active-pane-item-changed', =>
      @updatePdfStatus()

    @subscribe atom.workspaceView, 'pdf-view:current-page-update', =>
      @updatePdfStatus()

  attach: ->
    @statusBar.appendLeft this

  afterAttach: ->
    @updatePdfStatus()

  getPdfStatus: (view) ->
    @pdfStatus.text("Page: #{view.currentPageNumber}/#{view.totalPageNumber}").show()

  updatePdfStatus: ->
    view = atom.workspaceView.getActiveView()

    if view and view.pdfDocument
      @getPdfStatus(view)
    else
      @pdfStatus.hide()
