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

    @currentPageNumber = 0
    @totalPageNumber = 0
    @centersBetweenPages = []
    @pageHeights = []
    @scrollTopBeforeUpdate = 0
    @scrollLeftBeforeUpdate = 0
    @updating = false

    @subscribe @file, 'contents-changed', => @updatePdf()
    @subscribe this, 'core:move-left', => @scrollLeft(@scrollLeft() - $(window).width() / 20)
    @subscribe this, 'core:move-right', => @scrollRight(@scrollRight() + $(window).width() / 20)

    @on 'scroll', => @onScroll()
    @subscribe $(window), 'resize', => @setCurrentPageNumber()

    @command 'pdf-view:zoom-in', => @zoomIn()
    @command 'pdf-view:zoom-out', => @zoomOut()
    @command 'pdf-view:reset-zoom', => @resetZoom()

  onScroll: ->
    if not @updating
      @scrollTopBeforeUpdate = @scrollTop()
      @scrollLeftBeforeUpdate = @scrollLeft()

    @setCurrentPageNumber()

  setCurrentPageNumber: ->
    if not @pdfDocument
      return

    center = (@scrollBottom() + @scrollTop())/2.0
    @currentPageNumber = 1

    if @centersBetweenPages.length == 0 && @pageHeights.length == @pdfDocument.numPages
      for pdfPageNumber in [1..@pdfDocument.numPages]
        @centersBetweenPages.push((@pageHeights[0..(pdfPageNumber-1)].reduce ((x,y) -> x + y), 0) + pdfPageNumber * 20 - 10)

    for pdfPageNumber in [2..@pdfDocument.numPages]
      if center >= @centersBetweenPages[pdfPageNumber-2] && center < @centersBetweenPages[pdfPageNumber-1]
        @currentPageNumber = pdfPageNumber

    atom.workspaceView.trigger 'pdf-view:current-page-update'

  updatePdf: ->
    @updating = true
    @container.find("canvas").remove()
    @canvases = []

    pdfData = new Uint8Array(fs.readFileSync(@filePath))
    PDFJS.getDocument(pdfData).then (pdfDocument) =>
      @pdfDocument = pdfDocument
      @totalPageNumber = @pdfDocument.numPages

      for pdfPageNumber in [1..@pdfDocument.numPages]
        canvas = $("<canvas/>", class: "page-container").appendTo(@container)[0]
        @canvases.push(canvas)

      @renderPdf()

  renderPdf: (scrollAfterRender = true) ->
    @centersBetweenPages = []
    @pageHeights = []

    for pdfPageNumber in [1..@pdfDocument.numPages]
      canvas = @canvases[pdfPageNumber-1]

      do (canvas) =>
        @pdfDocument.getPage(pdfPageNumber).then (pdfPage) =>
          viewport = pdfPage.getViewport(@currentScale)
          context = canvas.getContext('2d')
          canvas.height = viewport.height
          canvas.width = viewport.width
          @pageHeights.push(Math.floor(viewport.height))

          pdfPage.render({canvasContext: context, viewport: viewport})

          if pdfPage.pageNumber == @pdfDocument.numPages and scrollAfterRender
            @scrollTop(@scrollTopBeforeUpdate)
            @scrollLeft(@scrollLeftBeforeUpdate)
            @setCurrentPageNumber()
            @updating = false

  zoomOut: ->
    @adjustSize(100 / (100 + @scaleFactor))

  zoomIn: ->
    @adjustSize((100 + @scaleFactor) / 100)

  resetZoom: ->
    @adjustSize(@defaultScale / @currentScale)

  computeZoomedScrollTop: (oldScrollTop, oldPageHeights) ->
    pixelsToZoom = 0
    spacesToSkip = 0
    zoomedPixels = 0

    for pdfPageNumber in [0...@pdfDocument.numPages]
      if pixelsToZoom + spacesToSkip + oldPageHeights[pdfPageNumber] > oldScrollTop
        zoomFactorForPage = @pageHeights[pdfPageNumber] / oldPageHeights[pdfPageNumber]
        partOfPageAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip)
        zoomedPixels += Math.round(partOfPageAboveUpperBorder * zoomFactorForPage)
        pixelsToZoom += partOfPageAboveUpperBorder
        break
      else
        pixelsToZoom += oldPageHeights[pdfPageNumber]
        zoomedPixels += @pageHeights[pdfPageNumber]

      if pixelsToZoom + spacesToSkip + 20 > oldScrollTop
        partOfPaddingAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip)
        spacesToSkip += partOfPaddingAboveUpperBorder
        break
      else
        spacesToSkip += 20

    return zoomedPixels + spacesToSkip

  adjustSize: (factor) ->
    oldScrollTop = @scrollTop()
    oldPageHeights = @pageHeights.slice(0)
    @currentScale = @currentScale * factor
    @renderPdf(false)

    process.nextTick =>
      newScrollTop = @computeZoomedScrollTop(oldScrollTop, oldPageHeights)
      @scrollTop(newScrollTop)

    process.nextTick =>
      newScrollLeft = @scrollLeft() * factor
      @scrollLeft(newScrollLeft)

  getCurrentPageNumber: () ->
    return @currentPageNumber

  getTotalPageNumber: () ->
    return @totalPageNumber

  scrollToPage: (pdfPageNumber) ->
    if not @pdfDocument or isNaN(pdfPageNumber)
      return

    pdfPageNumber = @pdfDocument.numPages unless pdfPageNumber < @pdfDocument.numPages
    pageScrollPosition = (@pageHeights[0...(pdfPageNumber-1)].reduce ((x,y) -> x + y), 0) + (pdfPageNumber - 1) * 20

    @scrollTop(pageScrollPosition)

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
