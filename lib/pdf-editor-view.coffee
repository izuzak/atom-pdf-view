{$, ScrollView} = require 'atom'
fs = require 'fs-plus'
path = require 'path'
require './../node_modules/pdf.js/build/singlefile/build/pdf.combined.js'
{File} = require 'pathwatcher'

module.exports =
class PdfEditorView extends ScrollView
  atom.deserializers.add(this)

  @deserialize: ({filePath}) ->
    if fs.isFileSync(filePath)
      new PdfEditorView(filePath)
    else
      console.warn "Could not deserialize PDF editor for path '#{filePath}' because that file no longer exists"

  @content: ->
    @div class: 'pdf-view', tabindex: -1, =>
      @div outlet: 'container'

  initialize: (path) ->
    super

    @currentScale = 1.5
    @defaultScale = 1.5
    @scaleFactor = 10.0

    @filePath = path
    @file = new File(@filePath)
    @canvases = []

    @updatePdf()

    @subscribe @file, 'contents-changed', => @updatePdf()
    @subscribe this, 'core:move-left', => @scrollLeft(@scrollLeft() - $(window).width() / 20)
    @subscribe this, 'core:move-right', => @scrollRight(@scrollRight() + $(window).width() / 20)

    @command 'pdf-view:zoom-in', => @zoomIn()
    @command 'pdf-view:zoom-out', => @zoomOut()
    @command 'pdf-view:reset-zoom', => @resetZoom()

  updatePdf: ->
    @container.find("canvas").remove()
    @currentScale = @defaultScale
    @canvases = []

    pdfData = new Uint8Array(fs.readFileSync(@filePath))
    PDFJS.getDocument(pdfData).then (pdfDocument) =>
      @pdfDocument = pdfDocument

      for pdfPageNumber in [1..@pdfDocument.numPages]
        canvas = $("<canvas/>", class: "page-container").appendTo(@container)[0]
        @canvases.push(canvas)

      @renderPdf()

  renderPdf: ->
    for pdfPageNumber in [1..@pdfDocument.numPages]
      canvas = @canvases[pdfPageNumber-1]

      do (canvas) =>
        @pdfDocument.getPage(pdfPageNumber).then (pdfPage) =>
          viewport = pdfPage.getViewport(@currentScale)
          context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width

          pdfPage.render({canvasContext: context, viewport: viewport})

  zoomOut: ->
    @adjustSize((100 - @scaleFactor) / 100)

  zoomIn: ->
    @adjustSize((100 + @scaleFactor) / 100)

  resetZoom: ->
    @adjustSize(@defaultScale / @currentScale)

  adjustSize: (factor) ->
    @currentScale = @currentScale * factor
    @renderPdf()
    @scrollTop(@scrollTop() * factor)
    @scrollLeft(@scrollLeft() * factor)

  serialize: ->
    {@filePath, deserializer: 'PdfEditorView'}

  getTitle: ->
    if @filePath?
      path.basename(@filePath)
    else
      'untitled'

  getUri: ->
    @filePath

  getPath: ->
    @filePath

  destroy: ->
    @detach()
