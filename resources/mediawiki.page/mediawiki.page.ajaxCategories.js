// TODO
//
// * The edit summary should contain the added/removed category name too. 
//     Something like: "Category:Foo added. Reason"
//     Requirement: Be able to get msg with lang option.
// * Handle uneditable cats. Needs serverside changes!
// * Add Hooks for change, delete, add
// * Add Hooks for soft redirect
// * Handle normal redirects
// * api.php / api.php5
// * Simple / MultiEditMode

( function( $, mw ) {
	var catLinkWrapper = '<li/>'
	var $container = $( '.catlinks' );
	
	var categoryLinkSelector = '#mw-normal-catlinks li a';
	var _request;
	
	var _catElements = {};
	var _otherElements = {};

	var namespaceIds = mw.config.get( 'wgNamespaceIds' )
	var categoryNamespaceId = namespaceIds['category'];
	var categoryNamespace = mw.config.get( 'wgFormattedNamespaces' )[categoryNamespaceId];
	var wgScriptPath = mw.config.get( 'wgScriptPath' );

	function _fetchSuggestions ( query ) {
		//SYNCED
		var _this = this;
		// ignore bad characters, they will be stripped out
		var catName = _stripIllegals( $( this ).val() );
		var request = $.ajax( {
			url: wgScriptPath + '/api.php',
			data: {
				'action': 'query',
				'list': 'allpages',
				'apnamespace': categoryNamespaceId,
				'apprefix': catName,
				'format': 'json'
			},
			dataType: 'json',
			success: function( data ) {
				// Process data.query.allpages into an array of titles
				var pages = data.query.allpages;
				var titleArr = [];

				$.each( pages, function( i, page ) {
					var title = page.title.split( ':', 2 )[1];
					titleArr.push( title );
				} );

				$( _this ).suggestions( 'suggestions', titleArr );
			}
		} );
		//TODO
		_request = request;
	}

	function _stripIllegals( cat ) {
		return cat.replace( /[\x00-\x1f\x3c\x3e\x5b\x5d\x7b\x7c\x7d\x7f]+/g, '' );
	}
	
	function _insertCatDOM( cat, isHidden ) {
		// User can implicitely state a sort key.
		// Remove before display
		cat = cat.replace(/\|.*/, '');

		// strip out bad characters
		cat = _stripIllegals ( cat );

		if ( $.isEmpty( cat ) || _containsCat( cat ) ) { 
			return; 
		}

		var $catLinkWrapper = $( catLinkWrapper );
		var $anchor = $( '<a/>' ).append( cat );
		$catLinkWrapper.append( $anchor );
		$anchor.attr( { target: "_blank", href: _catLink( cat ) } );
		if ( isHidden ) {
			$container.find( '#mw-hidden-catlinks ul' ).append( $catLinkWrapper );
		} else {
			$container.find( '#mw-normal-catlinks ul' ).append( $catLinkWrapper );
		}
		_createCatButtons( $anchor.get(0) );
	}
	
	function _makeSuggestionBox( prefill, callback, buttonVal ) {
		// Create add category prompt
		var promptContainer = $( '<div class="mw-addcategory-prompt"/>' );
		var promptTextbox = $( '<input type="text" size="45" class="mw-addcategory-input"/>' );
		if ( prefill !== '' ) {
			promptTextbox.val( prefill );
		}
		var addButton = $( '<input type="button" class="mw-addcategory-button"/>' );
		addButton.val( buttonVal );

		addButton.click( callback );

		promptTextbox.suggestions( {
			'fetch':_fetchSuggestions,
			'cancel': function() {
				var req = _request;
				// XMLHttpRequest.abort is unimplemented in IE6, also returns nonstandard value of "unknown" for typeof
				if ( req && ( typeof req.abort !== 'unknown' ) && ( typeof req.abort !== 'undefined' ) && req.abort ) {
					req.abort();
				}
			}
		} );

		promptTextbox.suggestions();

		promptContainer.append( promptTextbox );
		promptContainer.append( addButton );

		return promptContainer;
	}
	
	// Create a valid link to the category.
	function _catLink ( cat ) {
		//SYNCED
		return mw.util.wikiGetlink( categoryNamespace + ':' + $.ucFirst( cat ) );
	}
	
	function _getCats() {
		return $container.find( categoryLinkSelector ).map( function() { return $.trim( $( this ).text() ); } );
	}

	function _containsCat( cat ) {
		//TODO: SYNC
		return _getCats().filter( function() { return $.ucFirst(this) == $.ucFirst(cat); } ).length !== 0;
	}
	
	function _confirmEdit ( page, fn, actionSummary, doneFn ) {

		// Produce a confirmation dialog
		var dialog = $( '<div/>' );

		dialog.addClass( 'mw-ajax-confirm-dialog' );
		dialog.attr( 'title', mw.msg( 'ajax-confirm-title' ) );

		// Intro text.
		var confirmIntro = $( '<p/>' );
		confirmIntro.text( mw.msg( 'ajax-confirm-prompt' ) );
		dialog.append( confirmIntro );

		// Summary of the action to be taken
		var summaryHolder = $( '<p/>' );
		var summaryLabel = $( '<strong/>' );
		summaryLabel.text( mw.msg( 'ajax-confirm-actionsummary' ) + " " );
		summaryHolder.text( actionSummary );
		summaryHolder.prepend( summaryLabel );
		dialog.append( summaryHolder );

		// Reason textbox.
		var reasonBox = $( '<input type="text" size="45" />' );
		reasonBox.addClass( 'mw-ajax-confirm-reason' );
		dialog.append( reasonBox );

		// Submit button
		var submitButton = $( '<input type="button"/>' );
		submitButton.val( mw.msg( 'ajax-confirm-save' ) );

		var submitFunction = function() {
			_addProgressIndicator( dialog );
			_doEdit(
				page,
				fn,
				reasonBox.val(),
				function() {
					doneFn();
					dialog.dialog( 'close' );
					_removeProgressIndicator( dialog );
				}
			);
		};

		var buttons = { };
		buttons[mw.msg( 'ajax-confirm-save' )] = submitFunction;
		var dialogOptions = {
			'AutoOpen' : true,
			'buttons' : buttons,
			'width' : 450
		};

		$( '#catlinks' ).prepend( dialog );
		dialog.dialog( dialogOptions );
	}

	function _doEdit ( page, fn, summary, doneFn ) {
		// Get an edit token for the page.
		var getTokenVars = {
			'action':'query',
			'prop':'info|revisions',
			'intoken':'edit',
			'titles':page,
			'rvprop':'content|timestamp',
			'format':'json'
		};

		$.get( wgScriptPath + '/api.php', getTokenVars,
			function( reply ) {
				var infos = reply.query.pages;
				$.each(
					infos,
					function( pageid, data ) {
						var token = data.edittoken;
						var timestamp = data.revisions[0].timestamp;
						var oldText = data.revisions[0]['*'];

						var newText = fn( oldText );

						if ( newText === false ) return;

						var postEditVars = {
							'action':'edit',
							'title':page,
							'text':newText,
							'summary':summary,
							'token':token,
							'basetimestamp':timestamp,
							'format':'json'
						};

						$.post( wgScriptPath + '/api.php', postEditVars, doneFn, 'json' );
					}
				);
			}
		, 'json' );
	}

	function _addProgressIndicator ( elem ) {
		var indicator = $( '<div/>' );

		indicator.addClass( 'mw-ajax-loader' );

		elem.append( indicator );
	}

	function _removeProgressIndicator ( elem ) {
		elem.find( '.mw-ajax-loader' ).remove();
	}
	
	function _makeCaseInsensitiv( string ) {
		var newString = '';
		for (var i=0; i < string.length; i++) {
			newString += '[' + string[i].toUpperCase() + string[i].toLowerCase() + ']';
		};
		return newString;
	}
	function _buildRegex ( category ) {
		// Build a regex that matches legal invocations of that category.
		var categoryNSFragment = '';
		$.each( namespaceIds, function( name, id ) {
			if ( id == 14 ) {
				// The parser accepts stuff like cATegORy, 
				// we need to do the same
				categoryNSFragment += '|' + _makeCaseInsensitiv ( $.escapeRE(name) );
			}
		} );
		categoryNSFragment = categoryNSFragment.substr( 1 ); // Remove leading |
		
		// Build the regex
		var titleFragment = $.escapeRE(category);

		firstChar = category.charAt( 0 );
		firstChar = '[' + firstChar.toUpperCase() + firstChar.toLowerCase() + ']';
		titleFragment = firstChar + category.substr( 1 );
		var categoryRegex = '\\[\\[(' + categoryNSFragment + '):' + titleFragment + '(\\|[^\\]]*)?\\]\\]';

		return new RegExp( categoryRegex, 'g' );
	}
	
	function _handleEditLink ( e ) {
		e.preventDefault();
		var $this = $( this );
		var $link = $this.parent().find( 'a:not(.icon)' );
		var category = $link.text();
		
		var $input = _makeSuggestionBox( category, _handleCategoryEdit, mw.msg( 'ajax-confirm-save' ) );
		$link.after( $input ).hide();
		_catElements[category].editButton.hide();
		_catElements[category].deleteButton.unbind('click').click( function() {
			$input.remove();
			$link.show();
			_catElements[category].editButton.show();
			$( this ).unbind('click').click( _handleDeleteLink );
		});
	}
	
	function _handleAddLink ( e ) {
		e.preventDefault();

		$container.find( '#mw-normal-catlinks>.mw-addcategory-prompt' ).toggle();
	}
	
	function _handleDeleteLink ( e ) {
		e.preventDefault();

		var $this = $( this );
		var $link = $this.parent().find( 'a:not(.icon)' );
		var category = $link.text();

		categoryRegex = _buildRegex( category );

		var summary = mw.msg( 'ajax-remove-category-summary', category );

		_confirmEdit(
			mw.config.get('wgPageName'),
			function( oldText ) {
				//TODO Cleanup whitespace safely?
				var newText = oldText.replace( categoryRegex, '' );

				if ( newText == oldText ) {
					var error = mw.msg( 'ajax-remove-category-error' );
					_showError( error );
					_removeProgressIndicator( $( '.mw-ajax-confirm-dialog' ) );
					$( '.mw-ajax-confirm-dialog' ).dialog( 'close' );
					return false;
				}

				return newText;
			},
			summary, 
			function() {
				$this.parent().remove();
			}
		);
	}

	function _handleCategoryAdd ( e ) {
		// Grab category text
		var category = $( this ).parent().find( '.mw-addcategory-input' ).val();
		category = $.ucFirst( category );

		if ( _containsCat(category) ) {
			// TODO add info alert
			return;
		}
		var appendText = "\n[[" + categoryNamespace + ":" + category + "]]\n";
		var summary = mw.msg( 'ajax-add-category-summary', category );

		_confirmEdit(
			mw.config.get( 'wgPageName' ),
			function( oldText ) { return oldText + appendText },
			summary,
			function() {
				_insertCatDOM( category, false );
			}
		);
	}

	function _handleCategoryEdit ( e ) {
		e.preventDefault();

		// Grab category text
		var categoryNew = $( this ).parent().find( '.mw-addcategory-input' ).val();
		categoryNew = $.ucFirst( categoryNew );
		
		var $this = $( this );
		var $link = $this.parent().parent().find( 'a:not(.icon)' );
		var category = $link.text();

		// User didn't change anything. Just close the box
		if ( category == categoryNew ) {
			$this.parent().remove();
			$link.show();
			return;
		}
		categoryRegex = _buildRegex( category );
		
		var summary = mw.msg( 'ajax-edit-category-summary', category, categoryNew );

		_confirmEdit(
			mw.config.get( 'wgPageName' ),
			function( oldText ) {
				var matches = oldText.match( categoryRegex );
				
				//Old cat wasn't found, likely to be transcluded
				if ( !$.isArray( matches ) ) {
					var error = mw.msg( 'ajax-edit-category-error' );
					_showError( error );
					_removeProgressIndicator( $( '.mw-ajax-confirm-dialog' ) );
					$( '.mw-ajax-confirm-dialog' ).dialog( 'close' );
					return false;
				}
				var sortkey = matches[0].replace( categoryRegex, '$2' );
				var newCategoryString = "[[" + categoryNamespace + ":" + categoryNew + sortkey + ']]';

				if (matches.length > 1) {
					// The category is duplicated.
					// Remove all but one match
					for (var i = 1; i < matches.length; i++) {
						oldText = oldText.replace( matches[i], ''); 
					}
				}
				var newText = oldText.replace( categoryRegex, newCategoryString );

				return newText;
			},
			summary, 
			function() {
				// Remove input box & button
				$this.parent().remove();

				// Update link text and href
				$link.show().text( categoryNew ).attr( 'href', _catLink( categoryNew ) );
			}
		);
	}
	function _showError ( str ) {
		var dialog = $( '<div/>' );
		dialog.text( str );

		$( '#bodyContent' ).append( dialog );

		var buttons = { };
		buttons[mw.msg( 'ajax-error-dismiss' )] = function( e ) {
			dialog.dialog( 'close' );
		};
		var dialogOptions = {
			'buttons' : buttons,
			'AutoOpen' : true,
			'title' : mw.msg( 'ajax-error-title' )
		};

		dialog.dialog( dialogOptions );
	}

	function _createButton ( icon, title, category, text ){
		var button = $( '<a>' ).addClass( category || '' )
			.attr('title', title);
		
		if ( text ) {
			var icon = $( '<a>' ).addClass( 'icon ' + icon );
			button.addClass( 'icon-parent' ).append( icon ).append( text );
		} else {
			button.addClass( 'icon ' + icon );
		}
		return button;
	}
	function _createCatButtons ( element ) {
		// Create remove & edit buttons
		var deleteButton = _createButton('icon-close', mw.msg( 'ajax-remove-category' ) );
		var editButton   = _createButton('icon-edit', mw.msg( 'ajax-edit-category' ) );

		//Not yet used
		var saveButton = _createButton('icon-tick', mw.msg( 'ajax-confirm-save' ) ).hide();
		
		deleteButton.click( _handleDeleteLink );
		editButton.click( _handleEditLink );

		$( element ).after( deleteButton ).after( editButton );

		//Save references to all links and buttons
		_catElements[$( element ).text()] = {
			link		: $( element ),
			parent		: $( element ).parent(),
			saveButton 	: saveButton,
			deleteButton: deleteButton,
			editButton 	: editButton
		};
	}
	function _setup() {
		// Could be set by gadgets like HotCat etc.
		if ( mw.config.get('disableAJAXCategories') ) {
			return;
		}
		// Only do it for articles.
		if ( !mw.config.get( 'wgIsArticle' ) ) return;

		var clElement = $( '#mw-normal-catlinks' );

		// Unhide hidden category holders.
		$('#mw-hidden-catlinks').show();


		// Create [Add Category] link
		var addLink = _createButton('icon-add', 
									mw.msg( 'ajax-add-category' ), 
									'mw-ajax-addcategory', 
									mw.msg( 'ajax-add-category' )
								   );
		addLink.click( _handleAddLink );
		clElement.append( addLink );

		// Create add category prompt
		var promptContainer = _makeSuggestionBox( '', _handleCategoryAdd, mw.msg( 'ajax-add-category-submit' ) );
		promptContainer.hide();

		// Create edit & delete link for each category.
		$( '#catlinks li a' ).each( function( e ) {
			_createCatButtons( this );
		});

		clElement.append( promptContainer );
	}
	function _teardown() {
		
	}
	_tasks = {
		list : [],
		executed : [],
		add : function( obj ) {
			this.list.push( obj );
		},
		next : function() {
			var task = this.list.shift();
			//run task
			this.executed.push( task );
		}
	}
	$(document).ready( function() {_setup()});

} )( jQuery, mediaWiki );