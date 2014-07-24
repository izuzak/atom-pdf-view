{$, EditorView, View} = require 'atom'

module.exports =
class PdfGoToPageView extends View
  @content: ->
    @div class: 'go-to-page overlay from-top mini', =>
      @subview 'miniEditor', new EditorView(mini: true)
      @div class: 'message', outlet: 'message'

  detaching: false

  initialize: ->
    atom.workspaceView.command 'pdf-view:go-to-page', =>
      @toggle()
      false

    @miniEditor.hiddenInput.on 'focusout', => @detach() unless @detaching
    @on 'core:confirm', => @confirm()
    @on 'core:cancel', => @detach()

    @miniEditor.preempt 'textInput', (e) =>
      false unless e.originalEvent.data.match(/[0-9]/)

  toggle: ->
    if @hasParent()
      @detach()
    else
      @attach()

  detach: ->
    return unless @hasParent()

    @detaching = true
    miniEditorFocused = @miniEditor.isFocused
    @miniEditor.setText('')
    @miniEditor.updateDisplay()

    super

    @restoreFocus() if miniEditorFocused
    @detaching = false

  confirm: ->
    pageNumber = @miniEditor.getText()
    pageNumber = parseInt(pageNumber, 10)
    pdfView = atom.workspaceView.getActiveView()

    @detach()

    if pdfView and pdfView.pdfDocument and pdfView.scrollToPage
      pdfView.scrollToPage(pageNumber)

  storeFocusedElement: ->
    @previouslyFocusedElement = $(':focus')

  restoreFocus: ->
    if @previouslyFocusedElement?.isOnDom()
      @previouslyFocusedElement.focus()
    else
      atom.workspaceView.focus()

  attach: ->
    pdfView = atom.workspaceView.getActiveView()

    if pdfView and pdfView.pdfDocument and pdfView.scrollToPage
      @storeFocusedElement()
      atom.workspaceView.append(this)
      @message.text("Enter a page number 1-#{pdfView.getTotalPageNumber()}")
      @miniEditor.focus()
