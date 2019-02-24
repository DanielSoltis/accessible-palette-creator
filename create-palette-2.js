/* TODO 
TEST ON FIREFOX AND ON LARGER SCREENS
Encode ASE in groups
*/

/*
Color information is stored in the variable 'colors'.

'colors' is an object that stores groups of colors with the format
    {group1: [color1, color2, ...],
    group2: [color1, color2, ...], ...}

In this version there are 4 groups: high-contrast-dark, low-contrast-dark, high-contrast-light, low-contrast-light.

Each color is an object with the format
    {name: string,
    rgb: [r, g, b], where r, g, b are integers 0-255
    lum: l, where l is a float 0-1. It's possible to calculate lum from rgb, but conversion is imperfect so it drifts if you go back and forth
    }
*/

/* global document, window, ArrayBuffer, DataView, Blob */

(function () {
    'use strict';
    
    //GLOBAL VARIABLES
    var colors = {}, //object to hold all color data
        tempColor = {}, //object to hold a color when it is being created/modified but before it is saved
        selectedGroup = '', //'' => no group selected; string => name of the group for the currently selected color
        selectedIndex = -1, //-1 => available to add a new color; i>=0 => index of the selected color
        hoverGroup = '', //'' => not hovering over any colors, string => name of the group for the color curently being hovered over
        hoverIndex = -1, //-1 => not hovering over any colors, i>=0 => index of the color being hovered over
        
        lumRange = [0.5, 0.5], //minimum to maximum luminance to show in the color picker

        DARK_GROUPS = ['high-contrast-dark', 'low-contrast-dark'],
        LIGHT_GROUPS = ['high-contrast-light', 'low-contrast-light'],
        AA = 4.5,
        AA_LARGE = 3,
        
        //GLOBAL SETTERS AND GETTERS
        setTempColor,
        setSelectedGroup,
        setSelectedIndex,
        setHoverGroup,
        setHoverIndex,
        setContrastLumRange,
        
        //UTILITY FUNCTIONS
        copyColorObject,
        convertRange,
        colorsObjectIsEmpty,
        
        //FUNCTIONS FOR SETTING UP EVENT LISTENERS AND BEHAVIORS
        setupMenuButtons,
        setupAddButtons,
        handleAddButton,
        setupColorPicker,
        setupModalBehaviors,
        
        //FUNCTIONS FOR TRACKING AND DISPLAYING COLORS
        dragThumb,
        incrementThumb,
        getHslFromPicker,
        updateSelectedColorFromPicker,
        updateSelectedColorFromRgb,
        updateSelectedColorFromHsl,
        fillHueCanvas,
        fillSatLumCanvas,
        updateInputs,
        updatePickerThumbPositions,
        updateCurrentAndContrastingColorDisplay,
        
        //FUNCTIONS FOR SELECTING, ADDING AND REPLACING COLORS
        getGroupColorButtonIndex,
        selectExistingColor,
        deselectButtons,
        addColor,
        replaceColor,
        deleteColor,
        clearColors,
        setEmptyState,
        sortByHslComponent,
        
        //FUNCTIONS FOR COLOR CONVERSION AND LUMINANCE CALCULATION
        rgbToNormalizedHsl,
        normalizedHslToRgb,
        getContrastingLuminance,
        standardHslToRgb,
        rgbToHex,
        hexToRgb,
        isValidRgb,
        isValidHsl,
        evaluateLuminance,
        convertLuminanceToNormalizedLuminance,
        evaluateContrast,
        interpretContrast,
        getContrastRatingAndValue,
        calculateLuminanceRange,
        getLumIncrement,
    
        //FUNCTIONS FOR LOADING AND SAVING FILES
        saveToLocalStorage,
        loadFromLocalStorage,
        openColorGroupFile,
        saveAsCSV,
        saveAsASE,
        saveForSketch,
        timestamp,
        downloadBlob,
        downloadURL,
        
        //functions for managing modal views
        showModal,
        generateGroupOverview,
        hideModal,
        hideModals;

    //INITIAL SETUP WHEN WINDOW IS LOADED
    window.onload = function () {

        setupMenuButtons();
        setupAddButtons();
        setupColorPicker();
        setupModalBehaviors();
        
        loadFromLocalStorage();
        fillHueCanvas();
        setEmptyState();
    };
    
    //GLOBAL SETTERS AND GETTERS
    setTempColor = function (name, rgb, lum) {
        tempColor.name = name;
        tempColor.rgb = rgb;
        tempColor.lum = lum;
    };
    
    setSelectedGroup = function (group) {
        selectedGroup = group;
    };

    setSelectedIndex = function (index) {
        selectedIndex = index;
    };

    setHoverGroup = function (group) {
        hoverGroup = group;
    };

    setHoverIndex = function (index) {
        hoverIndex = index;
    };
    
    setContrastLumRange  = function (range) {
        lumRange[0] = range[0];
        lumRange[1] = range[1];
    };
    
    //UTILITY FUNCTIONS
    
    //copies the values of a color object from a source to a destination color
    copyColorObject = function (sourceColor, destinationColor) {
        destinationColor.name = sourceColor.name;
        destinationColor.rgb = [parseInt(sourceColor.rgb[0], 10), parseInt(sourceColor.rgb[1], 10), parseInt(sourceColor.rgb[2], 10)];
        destinationColor.lum = sourceColor.lum;
    };
    
    //returns true if there are no colors saved in the colors object, false if there are any
    colorsObjectIsEmpty = function (colors) {
        var empty = true;
        Object.keys(colors).forEach(function (group) {
            if (colors[group].length > 0) {
                empty = false;
            }
        });
        return empty;
    };
    
    //utility function to convert a value from array r1 to array r2 (both [min, max])
    convertRange = function (value, r1, r2) {
        var newValue;
        if (r1[0] === r1[1]) {
            window.console.log('trivial conversion, there is no initial range');
            newValue = r2[0] + (r2[1] - r2[0]) / 2; //return a value in the center of the new range
        } else {
            newValue = r2[0] + (value - r1[0]) * (r2[1] - r2[0]) / (r1[1] - r1[0]);
            if (value < Math.min(r1[0], r1[1]) || value > Math.max(r1[1], r1[0])) {
                window.console.log('value is outside of the initial range. may have unexpected errors.');
            }
        }
        return newValue;
    };
    
    //FUNCTIONS FOR SETTING UP EVENT LISTENERS AND BEHAVIORS

    //window-level click detection
    window.onclick = function (event) {
        var i, dropdowns = document.getElementsByClassName('dropdown-content'), openDropdown,
            outsideActiveArea = true, t = event.target;
        
        // Close the dropdown menu if the user clicks outside of it
        if (!t.matches('.dropdown-button')) {
            for (i = 0; i < dropdowns.length; i += 1) {
                openDropdown = dropdowns[i];
                if (openDropdown.classList.contains('show')) {
                    openDropdown.classList.remove('show');
                    outsideActiveArea = false; //do not deselect the color
                }
            }
        }
        
        //deselects a selected color if you click on an inactive area of the window. there's gotta be a better way.
        if (t.matches('.group-color-button') || t.matches('.add-color-button-message') || t.matches('.standard-button') || t.matches('.text-input') || t.matches('.color-component-input') || t.matches('.draggable-thumb') || t.matches('#modal-background') || t.matches('.contrast-label') || t.matches('.group-color-label')) {
            outsideActiveArea = false;
        }

        if (outsideActiveArea === true) {
            setEmptyState();
        }
    };
    
    //keyboard shortcuts
    window.onkeydown = function (event) {
        var enteringText = false,
            hslHover,
            hueThumb = document.getElementById('hue-thumb'),
            satLumThumb = document.getElementById('sat-lum-thumb'),
            newColor = false;
        
        switch (event.key) {

        //If a user hits enter, add or replace the selected color - except when they're entering text in an input field
        case 'Enter':

            //check if the user is in an input field
            Array.prototype.forEach.call(document.getElementsByClassName('color-component-input'), function (input) {
                if (document.activeElement === input) {
                    enteringText = true;
                    input.blur();
                }
            });
            if (document.activeElement === document.getElementById('name-input')) {
                enteringText = true;
                document.getElementById('name-input').blur();
            }

            //if they're not in an input field and something is selected, then add or replace the selected color with the current color
            if (!enteringText && selectedGroup !== '') {
                if (selectedIndex === -1) {
                    
                    if (colors[selectedGroup].length === 0) {
                        newColor = true;
                    } else if (tempColor.rgb[0] !== colors[selectedGroup][0].rgb[0] || tempColor.rgb[1] !== colors[selectedGroup][0].rgb[1] || tempColor.rgb[2] !== colors[selectedGroup][0].rgb[2]) {
                        newColor = true;
                    }

                    if (newColor) {
                        addColor(tempColor, selectedGroup);
                        saveToLocalStorage(colors);
                        selectExistingColor(selectedGroup, 0);
                    }
                } else if (selectedIndex >= 0) {
                    replaceColor(tempColor, selectedGroup, selectedIndex);
                    saveToLocalStorage(colors);
                }
            }
            break;

        //if a user hits escape, then whatever is selected is deselected, and the window goes back to the empty state
        case 'Escape':
            if (document.getElementById('modal-background').style.display === 'block') {
                hideModals();
            } else {
                setEmptyState();
            }
            break;

        //if a user is hovering over an existing color and presses the space key, then set the current color to match that color
        //(only match hue and sat if the hovered color and current color are in a different group)
        case ' ':
            if (hoverIndex >= 0) {
                event.preventDefault();
                
                if (selectedGroup === hoverGroup) {
                    updateSelectedColorFromRgb(colors[hoverGroup][hoverIndex].rgb, lumRange, selectedGroup, selectedIndex);
                } else {
                    hslHover = rgbToNormalizedHsl(colors[hoverGroup][hoverIndex].rgb);
                    updateSelectedColorFromHsl([hslHover[0], hslHover[1], tempColor.lum], lumRange, selectedGroup, selectedIndex);
                }
            }
            break;

        //if a user has selected one of the slider thumbs, they can use the arrow keys to nudge them up, right, left or down
        case 'Down': // IE/Edge specific value
        case 'ArrowDown':
            if (hueThumb === document.activeElement) {
                event.preventDefault();
                incrementThumb(hueThumb, 0, 1);
                fillSatLumCanvas(lumRange);
            } else if (satLumThumb === document.activeElement) {
                event.preventDefault();
                incrementThumb(satLumThumb, 0, getLumIncrement(lumRange));
            }
            break;
        case 'Up': // IE/Edge specific value
        case 'ArrowUp':
            if (hueThumb === document.activeElement) {
                event.preventDefault();
                incrementThumb(hueThumb, 0, -1);
                fillSatLumCanvas(lumRange);
            } else if (satLumThumb === document.activeElement) {
                event.preventDefault();
                incrementThumb(satLumThumb, 0, -getLumIncrement(lumRange));
            }
            break;
        case 'Left': // IE/Edge specific value
        case 'ArrowLeft':
            if (satLumThumb === document.activeElement) {
                event.preventDefault();
                incrementThumb(satLumThumb, -2, 0);
            }
            break;
        case 'Right': // IE/Edge specific value
        case 'ArrowRight':
            if (satLumThumb === document.activeElement) {
                event.preventDefault();
                incrementThumb(satLumThumb, 2, 0);
            }
            break;
        default:
            return; // Quit when this doesn't handle the key event.
        }
    };
    
    //event listeners for the buttons in the menu
    setupMenuButtons = function () {
        
        document.getElementById('about-button').onclick = function () {
            showModal('about-modal');
            this.blur();
        };
        
        //not in the menu, but duplicates the 'about' button functionality
        document.getElementById('empty-state-button').onclick = function () {
            showModal('about-modal');
            this.blur();
        };
        
        document.getElementById('load-button').onclick = function () {
            openColorGroupFile();
            this.blur();
        };
        
        document.getElementById('save-csv-button').onclick = function () {
            saveAsCSV(colors);
            this.blur();
        };
        
        document.getElementById('save-ase-button').onclick = function () {
            saveAsASE(colors);
            this.blur();
        };
        
        document.getElementById('save-sketch-button').onclick = function () {
            saveForSketch(colors);
            this.blur();
        };
        
        document.getElementById('sort-button').onclick = function () {
            document.getElementById('sort-dropdown').classList.toggle('show');
        };
        
        document.getElementById('dropdown-hue').onclick = function () {
            sortByHslComponent(colors, 0);
            saveToLocalStorage(colors);
            setEmptyState(); //this is easier than keeping track of the new index of a previously selected color;
        };
        
        document.getElementById('dropdown-sat').onclick = function () {
            sortByHslComponent(colors, 1);
            saveToLocalStorage(colors);
            setEmptyState();
        };
        
        document.getElementById('dropdown-lum').onclick = function () {
            sortByHslComponent(colors, 2);
            saveToLocalStorage(colors);
            setEmptyState();
        };
        
        document.getElementById('overview-button').onclick = function () {
            showModal('overview-modal');
            this.blur();
        };
        
        document.getElementById('clear-all-button').onclick = function () {
            if (window.confirm('Remove all colors from the group?') === true) {
                clearColors();
                setEmptyState();
                saveToLocalStorage(colors);
            }
            this.blur();
        };
    };
    
    //set up even listeners for the button in each group for adding a new color
    setupAddButtons = function () {
        Array.prototype.forEach.call(document.getElementsByClassName('add-color-button'), function (button) {
            button.onclick = function () {
                handleAddButton(button, selectedGroup, selectedIndex, tempColor);
                this.blur();
            };
        });
    };
    
    //takes in an add button, the previously selected group id, the previously selected index, and a color object
    //updates messaging, the selected group and index to those of the add button
    //if the button is already selected, adds the current color to the group
    handleAddButton = function (button, previousGroup, previousIndex, color) {
        
        var colorPickerLabel = '', newColor = false;
        
        //if the add button has already been selected and there's a new color available, add it
        if (previousIndex === -1 && previousGroup === button.id.slice(0, -7)) {
            
            if (colors[previousGroup].length === 0) {
                newColor = true;
            } else if (color.rgb[0] !== colors[previousGroup][0].rgb[0] || color.rgb[1] !== colors[previousGroup][0].rgb[1] || color.rgb[2] !== colors[previousGroup][0].rgb[2]) {
                newColor = true;
            }
            
            if (newColor) {
                addColor(color, previousGroup);
                saveToLocalStorage(colors);
                selectExistingColor(selectedGroup, 0);
            }
            
        //otherwise set up the color picker to allow the user to set a new color in the button's group
        } else {
            
            //hide the instructions panel that appears when nothing is selected
            document.getElementById('empty-state-panel').style.display = 'none';
            
            //set the global variables to indicate the group of the button, and the index number for a new color
            setSelectedGroup(button.id.slice(0, -7));
            setSelectedIndex(-1);
            
            //set the text for the label on the color picker
            switch (selectedGroup) {
            case 'high-contrast-dark':
                colorPickerLabel = '<strong>Add</strong> a new <strong>dark high-contrast</strong> color';
                break;
            case 'high-contrast-light':
                colorPickerLabel = '<strong>Add</strong> a new <strong>light high-contrast</strong> color';
                break;
            case 'low-contrast-dark':
                colorPickerLabel = '<strong>Add</strong> a new <strong>dark medium-contrast</strong> color';
                break;
            case 'low-contrast-light':
                colorPickerLabel = '<strong>Add</strong> a new <strong>light medium-contrast</strong> color';
                break;
            }
            document.getElementById('color-picker-label').innerHTML = colorPickerLabel;

            //reset the name for the new color to be added
            tempColor.name = '';
            document.getElementById('name-input').value = tempColor.name;
            
            //set the color of the satLumThumb to contrast with the color in the picker
            if (DARK_GROUPS.includes(selectedGroup)) {
                document.getElementById('sat-lum-thumb').style.borderColor = '#fafafa';
            } else {
                document.getElementById('sat-lum-thumb').style.borderColor = '#1e1e1e';
            }

            //deselect any previously selected button, and set the style of this button to show it is selected
            deselectButtons();
            
            button.classList.add('add-color-button-selected');
            
            if (DARK_GROUPS.includes(selectedGroup)) {
                button.style.color = '#fafafa';
            }
            button.getElementsByClassName('add-color-button-message')[0].innerHTML = 'Add';
            
            //set the color in the picker
            setContrastLumRange(calculateLuminanceRange(selectedGroup));
            updateSelectedColorFromPicker(lumRange, selectedGroup, selectedIndex);
            fillSatLumCanvas(lumRange);
        }
    };

    setupColorPicker = function () {
        
        var nameInput = document.getElementById('name-input'),
            hueThumb = document.getElementById('hue-thumb'),
            satLumThumb = document.getElementById('sat-lum-thumb'),
            hexInput = document.getElementById('hex-input'),
            redInput = document.getElementById('red-input'),
            greenInput = document.getElementById('green-input'),
            blueInput = document.getElementById('blue-input'),
            hueInput = document.getElementById('hue-input'),
            satInput = document.getElementById('sat-input'),
            lumInput = document.getElementById('lum-input');
        
        //keep track of the name for the current color
        nameInput.onchange = function () {
            tempColor.name = nameInput.value;
        };
        
        //set up the thumbs on the hue slider and the sat-lum graph to be draggable
        dragThumb(hueThumb, false, true);
        dragThumb(satLumThumb, true, true);
        
        //set up the RGB and HSL inputs to check for validity and update the display and other colorspace
        Array.prototype.forEach.call(document.getElementsByClassName('color-component-input'), function (input) {
            
            switch (input.id) {
            case 'red-input':
            case 'green-input':
            case 'blue-input':
                input.onchange = function () {
                    if (input.value >= 0 && input.value < 256) {
                        if (isValidRgb([redInput.value, greenInput.value, blueInput.value])) {
                            var hsl = rgbToNormalizedHsl([redInput.value, greenInput.value, blueInput.value]);
                            if ((hsl[2] <= lumRange[0] && hsl[2] >= lumRange[1]) || (hsl[2] >= lumRange[0] && hsl[2] <= lumRange[1])) {
                                updateSelectedColorFromRgb([redInput.value, greenInput.value, blueInput.value], lumRange, selectedGroup, selectedIndex);
                                redInput.style.color = '#1e1e1e';
                                greenInput.style.color = '#1e1e1e';
                                blueInput.style.color = '#1e1e1e';
                            } else {
                                redInput.style.color = '#cc0000';
                                greenInput.style.color = '#cc0000';
                                blueInput.style.color = '#cc0000';
                            }
                        }
                    } else {
                        input.style.color = '#cc0000';
                    }
                };
                break;
            case 'hue-input':
                input.onchange = function () {
                    if (input.value >= 0 && input.value <= 360) {
                        if (isValidHsl([hueInput.value, satInput.value, lumInput.value])) {
                            updateSelectedColorFromHsl([Math.round(hueInput.value), parseFloat(satInput.value), parseFloat(lumInput.value)], lumRange, selectedGroup, selectedIndex);
                        }
                    } else {
                        input.style.color = '#cc0000';
                    }
                };
                break;
            case 'sat-input':
                input.onchange = function () {
                    if (input.value >= 0 && input.value <= 1) {
                        if (isValidHsl([hueInput.value, satInput.value, lumInput.value])) {
                            updateSelectedColorFromHsl([Math.round(hueInput.value), parseFloat(satInput.value), parseFloat(lumInput.value)], lumRange, selectedGroup, selectedIndex);
                        }
                    } else {
                        input.style.color = '#cc0000';
                    }
                };
                break;
            case 'lum-input':
                input.onchange = function () {
                    if ((input.value >= lumRange[1] && input.value <= lumRange[0]) || (input.value >= lumRange[0] && input.value <= lumRange[1])) {
                        if (isValidHsl([hueInput.value, satInput.value, lumInput.value])) {
                            updateSelectedColorFromHsl([Math.round(hueInput.value), parseFloat(satInput.value), parseFloat(lumInput.value)], lumRange, selectedGroup, selectedIndex);
                        }
                    } else {
                        input.style.color = '#cc0000';
                    }
                };
                break;
            case 'hex-input':
                input.onchange = function () {
                    var rgb = hexToRgb(hexInput.value),
                        hsl;
                    if (rgb !== null) {
                        if (isValidRgb(rgb)) {
                            hsl = rgbToNormalizedHsl(rgb);
                            if ((hsl[2] <= lumRange[0] && hsl[2] >= lumRange[1]) || (hsl[2] >= lumRange[0] && hsl[2] <= lumRange[1])) {
                                updateSelectedColorFromRgb(rgb, lumRange, selectedGroup, selectedIndex);
                                input.style.color = '#1e1e1e';
                            } else {
                                input.style.color = '#cc0000';
                            }
                        } else {
                            hexInput.style.color = '#cc0000';
                        }
                    } else {
                        hexInput.style.color = '#cc0000';
                    }
                
                };

                break;
            }
            input.onkeydown = function () { //get rid of the red 'error' color from invalid inputs
                input.style.color = '#1e1e1e';
            };
        });
        
        document.getElementById('cancel-button').onclick = function () {
            setEmptyState();
            this.blur();
        };
        
        document.getElementById('confirm-button').onclick = function () {
            var newColor = false;
            
            if (selectedIndex === -1) {
                
                if (colors[selectedGroup].length === 0) {
                    newColor = true;
                } else if (tempColor.rgb[0] !== colors[selectedGroup][0].rgb[0] || tempColor.rgb[1] !== colors[selectedGroup][0].rgb[1] || tempColor.rgb[2] !== colors[selectedGroup][0].rgb[2]) {
                    newColor = true;
                }

                if (newColor) {
                    addColor(tempColor, selectedGroup);
                    saveToLocalStorage(colors);
                    selectExistingColor(selectedGroup, 0);
                }

            } else if (selectedIndex >= 0) {
                replaceColor(tempColor, selectedGroup, selectedIndex);
                saveToLocalStorage(colors);
            }
            this.blur();
        };
    };
    
    //set up event listeners for closing an open modal when the background or close button is clicked
    setupModalBehaviors = function () {
        
        document.getElementById('modal-background').onclick = function () {
            hideModals();
        };
        
        Array.prototype.forEach.call(document.getElementsByClassName('close-button'), function (closeButton) {
            closeButton.onclick = function () {
                hideModal(closeButton.parentElement.id);
            };
        });
    };
    
    //FUNCTIONS FOR TRACKING AND DISPLAYING COLORS
    
    //enables the element thumb to be dragged with the mouse. horiz and vert are booleans that enable dragging in those directions
    dragThumb = function (thumb, horiz, vert) {
        var jumpToMouse = true, dragMouseDown, thumbDrag, closeDragThumb, parentRect;
        
        //this prevents a minute jump when a user clicks on the element; allows a user to more finely control position by clicking and using arrow keys
        thumb.onmouseover = function () {
            jumpToMouse = false;
        };
        thumb.onmouseout = function () {
            jumpToMouse = true;
        };

        dragMouseDown = function () {
 
            parentRect = thumb.parentElement.getBoundingClientRect();
            
            //if the user clicks on the parent element outside the thumb, the thumb jumps to that location
            if (jumpToMouse === true) {
                thumbDrag();
                thumb.focus();
            }

            //enable dragging
            document.onmousemove = thumbDrag;
            document.onmouseup = closeDragThumb;
        };

        thumbDrag = function (e) {
            e = e || window.event;
            e.preventDefault();
            
            // calculate the new cursor position:
            if (horiz === true) {
                thumb.style.left = Math.min(Math.max(0, e.clientX - parentRect.left), parentRect.width) + 'px';
            }
            if (vert === true) {
                thumb.style.top = Math.min(Math.max(0, e.clientY - parentRect.top), parentRect.height) + 'px';
            }
            
            if (thumb.id === 'hue-thumb') {
                fillSatLumCanvas(lumRange);
            }
            updateSelectedColorFromPicker(lumRange, selectedGroup, selectedIndex);
        };

        closeDragThumb = function () {
            
            // stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;
        };
        
        thumb.parentElement.onmousedown = dragMouseDown;
    };
    
    //moves a thumb element in the given horizontal and vertical directions, within the bounds of its parent element
    incrementThumb = function (thumb, horizIncrement, vertIncrement) {
        
        var thumbRect = thumb.getBoundingClientRect(),
            parentRect = thumb.parentElement.getBoundingClientRect();
        
        if (horizIncrement !== 0) {
            thumb.style.left = Math.min(parentRect.width, Math.max(0, thumbRect.left - parentRect.left + thumbRect.width / 2 + horizIncrement)) + 'px';
        }
        
        if (vertIncrement !== 0) {
            thumb.style.top = Math.min(parentRect.height, Math.max(0, thumbRect.top - parentRect.top + thumbRect.height / 2 + vertIncrement)) + 'px';
        }
        
        updateSelectedColorFromPicker(lumRange, selectedGroup, selectedIndex);
    };
    
    //takes in a base luminance and group and returns the color that the picker is pointing to, as an array [h, s, l]
    getHslFromPicker = function (lumRange) {
        var hueThumb = document.getElementById('hue-thumb'),
            hue = hueThumb.offsetTop + hueThumb.getBoundingClientRect().height / 2,
            satLumThumb = document.getElementById('sat-lum-thumb'),
            satLumCanvasRect = satLumThumb.parentElement.getBoundingClientRect(),
            satPosition = satLumThumb.offsetLeft + satLumThumb.getBoundingClientRect().width / 2,
            sat = convertRange(satPosition, [0, satLumCanvasRect.width], [0, 1]),
            lumPosition = satLumThumb.offsetTop + satLumThumb.getBoundingClientRect().height / 2,
            lum;

        if (lumRange[1] < lumRange[0]) {
            lum = convertRange(lumPosition, [0, satLumCanvasRect.height], [lumRange[1], lumRange[0]]);
        } else {
            lum = convertRange(satLumCanvasRect.height - lumPosition, [0, satLumCanvasRect.height], [lumRange[0], lumRange[1]]);
        }
        return [hue, sat, lum];
    };
    
    //given a base luminance and group, updates the tempColor and related displays
    updateSelectedColorFromPicker = function (lumRange, group, index) {
        var hsl = getHslFromPicker(lumRange),
            rgb = normalizedHslToRgb(hsl);
        
        setTempColor(tempColor.name, rgb, hsl[2]);
        
        updateInputs(hsl, rgb);
        updateCurrentAndContrastingColorDisplay(rgb, group, index);
    };
    
    //takes in an array [r, g, b] and updates the tempColor and related displays
    updateSelectedColorFromRgb = function (rgb, lumRange, group, index) {
        var hsl = rgbToNormalizedHsl(rgb);
        
        setTempColor(tempColor.name, rgb, hsl[2]);
        
        updateInputs(hsl, rgb);
        updateCurrentAndContrastingColorDisplay(rgb, group, index);
        updatePickerThumbPositions(hsl, lumRange);
        fillSatLumCanvas(lumRange);
    };
    
    //takes in an array for normalized [h, s, l] and updates the tempColor and related displays
    updateSelectedColorFromHsl = function (hsl, lumRange, group, index) {
        var rgb = normalizedHslToRgb(hsl);
        
        setTempColor(tempColor.name, rgb, hsl[2]);
        
        updateInputs(hsl, rgb);
        updateCurrentAndContrastingColorDisplay(rgb, group, index);
        updatePickerThumbPositions(hsl, lumRange);
        fillSatLumCanvas(lumRange);
    };
    
    //fills the hue canvas with hues from 0-360 
    fillHueCanvas = function () {
        
        var hueCanvas = document.getElementById('hue-canvas'),
            hueCanvasContext = hueCanvas.getContext('2d'),
            hueIndex,
            hueColor;

        for (hueIndex = 0; hueIndex < 360; hueIndex += 1) {
            hueColor = [hueIndex / 360, 1, 0.5];
            hueCanvasContext.fillStyle = 'rgb(' + standardHslToRgb(hueColor) + ')';
            hueCanvasContext.fillRect(0, hueCanvas.height * hueIndex / 360, hueCanvas.width, 1);
        }
    };
    
    //takes in a luminance range [0-1, 0-1] and a group
    //if the group is dark, then the canvas goes up from baselum to lighter: direction 1
    //if the group is light, then the canvas goes down from baselum to darker: direction -1
    fillSatLumCanvas = function (range) {
        var satLumCanvas = document.getElementById('sat-lum-canvas'),
            satLumCanvasContext = satLumCanvas.getContext('2d'),
            hueThumb = document.getElementById('hue-thumb'),
            hue = hueThumb.offsetTop + hueThumb.getBoundingClientRect().height / 2,
            satStep = 1 / satLumCanvas.width,
            satIndex,
            lumIncrement = getLumIncrement(range),
            lumStep,
            lumIndex,
            currentColor,
            direction;
        
        if (range[0] > range[1]) {
            direction = -1;
            lumStep = (range[0] - range[1]) / satLumCanvas.height; //go down from range[0] to range[1]
        } else {
            direction = 1;
            lumStep = (range[1] - range[0]) / satLumCanvas.height; //go up from range[0] to range[1]
        }
        
        for (satIndex = 0; satIndex < satLumCanvas.width; satIndex += 3) {
            for (lumIndex = 0; lumIndex < satLumCanvas.height; lumIndex += lumIncrement) {
                currentColor = [hue, satIndex * satStep, range[0] + direction * lumIndex * lumStep];
                satLumCanvasContext.fillStyle = 'rgb(' + normalizedHslToRgb(currentColor) + ')';
                satLumCanvasContext.fillRect(satIndex, satLumCanvas.height - lumIndex - lumIncrement, 3, lumIncrement);
            }
        }
    };

    //takes in an array for normalized hsl values and for rgb values, and sets the values of the color component inputs
    updateInputs = function (hsl, rgb) {
        document.getElementById('hue-input').value = Math.round(hsl[0]);
        document.getElementById('sat-input').value = hsl[1].toFixed(3);
        document.getElementById('lum-input').value = hsl[2].toFixed(3);
        
        document.getElementById('red-input').value = Math.round(rgb[0]);
        document.getElementById('green-input').value = Math.round(rgb[1]);
        document.getElementById('blue-input').value = Math.round(rgb[2]);
        
        document.getElementById('hex-input').value = rgbToHex(rgb);
        
        Array.prototype.forEach.call(document.getElementsByClassName('color-component-input'), function (input) {
            input.style.color = '#1e1e1e';
        });
    };
    
    //takes in an hsl value, baselum and group, and updates the position of the picker thumbs to match the hsl value
    updatePickerThumbPositions = function (hsl, range) {
        var hueThumb = document.getElementById('hue-thumb'),
            satLumThumb = document.getElementById('sat-lum-thumb');
        
        hueThumb.style.top =  hsl[0] + 'px';
        satLumThumb.style.left =  (Math.round(satLumThumb.parentElement.getBoundingClientRect().width * hsl[1])) + 'px';
        satLumThumb.style.top = Math.round(convertRange(hsl[2], range, [satLumThumb.parentElement.getBoundingClientRect().height, 0])) + 'px';
    };
    
    //takes in array [r, g, b] and updates the bottom display with that color and its contrast with contrasting colors
    updateCurrentAndContrastingColorDisplay = function (rgb, group, index) {
        
        var rgbString = 'rgb(' + rgb + ')',
            groupColorButton,
            groupColorLabel,
            groupContrastLabel,
            groups = [];
        
        //calculate and show the contrast values for the opposite side of the group
        if (DARK_GROUPS.includes(group)) { //if we're currently in a dark color, show the contrast value for all the light colors
            groups[0] = LIGHT_GROUPS;
            groups[1] = DARK_GROUPS;
        } else {
            groups[0] = DARK_GROUPS;
            groups[1] = LIGHT_GROUPS;
        }
            
        groups[0].forEach(function (contrastingGroup) {
            Array.prototype.forEach.call(document.getElementById(contrastingGroup).getElementsByClassName('group-color-button'), function (button) {
                var buttonColor = button.style.backgroundColor.slice(0, -1).slice(4).split(','),
                    contrastLabel = button.getElementsByClassName('contrast-label')[0];

                contrastLabel.style.visibility = 'visible';
                contrastLabel.style.color = rgbString;
                contrastLabel.innerHTML = getContrastRatingAndValue(rgb, [Math.round(buttonColor[0]), Math.round(buttonColor[1]), Math.round(buttonColor[2])]);
            });
        });
        groups[1].forEach(function (similarGroup) {
            Array.prototype.forEach.call(document.getElementById(similarGroup).getElementsByClassName('group-color-button'), function (button) {
                button.getElementsByClassName('contrast-label')[0].style.visibility = 'hidden';
            });
        });
        
        //if the selected item is an existing color, update the display of that color to reflect the current color (rgb)
        if (index >= 0) {
            groupColorButton = document.getElementById(group).getElementsByClassName('group-color-button')[index];
            groupColorLabel = groupColorButton.getElementsByClassName('group-color-label')[0];
            groupContrastLabel = groupColorButton.getElementsByClassName('contrast-label')[0];
            
            groupColorButton.style.backgroundColor = rgbString;
            groupColorLabel.innerHTML = rgb[0] + ', ' + rgb[1] + ', ' + rgb[2];
            
            if (rgb !== colors[group][index].rgb) {
                groupContrastLabel.style.visibility = 'visible';
                groupContrastLabel.innerHTML = 'Update<br>color';

                if (DARK_GROUPS.includes(selectedGroup)) {
                    groupContrastLabel.style.color = '#fafafa';
                } else {
                    groupContrastLabel.style.color = '#1e1e1e';
                }
            }
        } else if (index === -1) { //if the selected item is a new color, update the display of the add color button to reflect the current color (rgb)
            document.getElementById(selectedGroup + '-group-container').getElementsByClassName('add-color-button')[0].style.backgroundColor = rgbString;
            document.getElementById(selectedGroup + '-group-container').getElementsByClassName('add-color-label')[0].innerHTML = rgb[0] + ', ' + rgb[1] + ', ' + rgb[2];
        }
    };
        
    //FUNCTIONS FOR SELECTING, ADDING AND REPLACING COLORS

    //given a color button, return the position of its row in its table
    getGroupColorButtonIndex = function (groupColorButton) {
        return groupColorButton.parentElement.parentElement.rowIndex;
    };

    //given a group and an index, select the color in that group at that position
    //and update relevant variables
    selectExistingColor = function (group, index) {
        var colorPickerLabel = '',
            groupColorButton = document.getElementById(group).getElementsByClassName('group-color-button')[index];
        
        //set global variables
        setSelectedGroup(group);
        setSelectedIndex(index);
        setContrastLumRange(calculateLuminanceRange(group));
        
        //show the name in the picker
        document.getElementById('name-input').value = colors[group][index].name;
        
        //set the color in the picker
        updateSelectedColorFromRgb(colors[group][index].rgb, lumRange, group, index);
        fillSatLumCanvas(lumRange);

        //deselect any selected buttons
        deselectButtons();
        
        //change the appearance of the button to show it is selected
        groupColorButton.classList.add('group-color-button-selected');
        groupColorButton.childNodes[1].classList.add('group-color-label-selected');
        groupColorButton.parentElement.getElementsByClassName('delete-button')[0].style.visibility = 'visible'; //delete button

        //make sure the color picker is visible
        document.getElementById('empty-state-panel').style.display = 'none';
        
        //change the messaging on the color picker to reflect the current group
        switch (group) {
        case 'high-contrast-dark':
            colorPickerLabel = '<strong>Change</strong> the selected <strong>dark high-contrast</strong> color';
            break;
        case 'high-contrast-light':
            colorPickerLabel = '<strong>Change</strong> the selected <strong>light high-contrast</strong> color';
            break;
        case 'low-contrast-dark':
            colorPickerLabel = '<strong>Change</strong> the selected <strong>dark medium-contrast</strong> color';
            break;
        case 'low-contrast-light':
            colorPickerLabel = '<strong>Change</strong> the selected <strong>light medium-contrast</strong> color';
            break;
        }
        document.getElementById('color-picker-label').innerHTML = colorPickerLabel;
        
        //change the color of the satLumThumb so it shows up against the canvas
        if (DARK_GROUPS.includes(group)) {
            document.getElementById('sat-lum-thumb').style.borderColor = '#fafafa';
        } else if (LIGHT_GROUPS.includes(group)) {
            document.getElementById('sat-lum-thumb').style.borderColor = '#1e1e1e';
        }
        
        //blur the button so it doesn't show the focus styling
        groupColorButton.blur();
        
    };
    
    deselectButtons = function () {
        
        //deselect any selected add color button
        Array.prototype.forEach.call(document.getElementsByClassName('add-color-button-selected'), function (button) {
            button.classList.remove('add-color-button-selected');
            button.style.backgroundColor = '#fafafa';
            button.style.color = '#1e1e1e';
            button.getElementsByClassName('add-color-button-message')[0].innerHTML = 'New color';
            button.getElementsByClassName('add-color-label')[0].innerHTML = '';
        });

        //deselect any selected group color button, and set the color back to the saved color
        Array.prototype.forEach.call(document.getElementsByClassName('group-color-button-selected'), function (button) {
            var group, index;
            
            group = button.parentElement.parentElement.parentElement.id;
            index = getGroupColorButtonIndex(button);
           
            button.style.backgroundColor = 'rgb(' + colors[group][index].rgb + ')';
            button.childNodes[1].innerHTML = colors[group][index].rgb[0] + ', ' + colors[group][index].rgb[1] + ', ' + colors[group][index].rgb[2];
            
            button.classList.remove('group-color-button-selected');
            button.childNodes[1].classList.remove('group-color-label-selected');
            button.parentElement.getElementsByClassName('delete-button')[0].style.visibility = 'hidden';
        });
        
        //reset the color for all the input elements, in case they were out of range
        Array.prototype.forEach.call(document.getElementsByClassName('color-component-input'), function (input) {
            input.style.color = '#1e1e1e';
        });
    };

    //adds a new color of the given color and group to the interface and colors object
    addColor = function (color, group) {
        var newColor = {}, tr, td, groupColorButton, groupColorLabel, contrastLabel, deleteButton;
        
        //add the color information to the colors object
        copyColorObject(color, newColor);
        colors[group].unshift(newColor);
        
        //create the new HTML elements that will be used to display the color
        tr = document.createElement('TR');
        td = document.createElement('TD');
        td.className = 'group-td';
        
        groupColorButton = document.createElement('BUTTON');
        groupColorButton.className = 'group-color-button';
        groupColorButton.style.backgroundColor = 'rgb(' + newColor.rgb[0] + ', ' + newColor.rgb[1] + ', ' + newColor.rgb[2] + ')';
        
        contrastLabel = document.createElement('DIV');
        contrastLabel.className = 'contrast-label';
        
        groupColorLabel = document.createElement('DIV');
        groupColorLabel.className = 'group-color-label';
        groupColorLabel.innerHTML = newColor.rgb[0] + ', ' + newColor.rgb[1] + ', ' + newColor.rgb[2];
        
        if (LIGHT_GROUPS.includes(group)) {
            groupColorButton.classList.add('group-color-button-light');
        }
        
        deleteButton = document.createElement('BUTTON');
        deleteButton.className = 'delete-button';
        deleteButton.innerHTML = '&times;';
        
        //create event listener for selecting the button
        groupColorButton.onclick = function () {
            if (!groupColorButton.classList.contains('group-color-button-selected')) {
                //if it's not already selected, select it
                selectExistingColor(group, getGroupColorButtonIndex(groupColorButton));
            } else {
                //if it's already selected, replace the existing color
                replaceColor(color, group, getGroupColorButtonIndex(groupColorButton));
                saveToLocalStorage(colors);
            }
            this.blur();
        };
        
        //keep track of if the button is being hovered over, for keyboard shortcuts
        groupColorButton.onmouseover = function () {
            setHoverGroup(group);
            setHoverIndex(getGroupColorButtonIndex(groupColorButton));
        };
        
        groupColorButton.onmouseout = function () {
            setHoverGroup('');
            setHoverIndex(-1);
        };
        
        //create event listener for the button to delete the color
        deleteButton.onclick = function () {
            if (window.confirm('Remove this color?')) {
                deleteColor(group, getGroupColorButtonIndex(groupColorButton));
                saveToLocalStorage(colors);
                setEmptyState();
            }
            deleteButton.blur();
        };
        
        //add the HTML elements to the document
        groupColorButton.appendChild(contrastLabel);
        groupColorButton.appendChild(groupColorLabel);
        td.appendChild(deleteButton);
        td.appendChild(groupColorButton);
        tr.appendChild(td);
        document.getElementById(group).insertBefore(tr, document.getElementById(group).childNodes[0]);
    };
    
    //update a button at the given group and index to a new color value
    replaceColor = function (color, group, index) {
        //add the updated color information to the colors object
        copyColorObject(color, colors[group][index]);
        
        //hide the 'update color' CTA (which will reappear once the color is changed)
        //another interaction could be to deselect everything, but that felt more annoying
        document.getElementById(group).getElementsByClassName('contrast-label')[index].style.visibility = 'hidden';
    };
    
    //remove the color at the given group and index
    deleteColor = function (group, index) {
        //remove the color from the colors object
        colors[group].splice(index, 1);
        
        //remove the color's row from the table
        var row = document.getElementById(group).getElementsByClassName('group-td')[index].parentElement;
        row.parentElement.removeChild(row);
        
    };
    
    //remove all the colors and restore a default state
    clearColors = function () {
        
        //remove all the rows from each group's table
        Array.prototype.forEach.call(document.getElementsByClassName('group-table'), function (table) {
            while (table.childNodes[0]) {
                table.removeChild(table.childNodes[0]);
            }
        });

        //reset the color arrays in the colors object
        colors['high-contrast-dark'] = [];
        colors['high-contrast-light'] = [];
        colors['low-contrast-dark'] = [];
        colors['low-contrast-light'] = [];
        
        setTempColor(null, null, null);

        //unselect any selected buttons
        setEmptyState();
    };
    
    setEmptyState = function () {
        //set the interface to empty state
        deselectButtons();
        setSelectedGroup('');
        setSelectedIndex(-1);
        document.getElementById('empty-state-panel').style.display = 'block';
        Array.prototype.forEach.call(document.getElementsByClassName('group-color-button'), function (button) {
            button.getElementsByClassName('contrast-label')[0].style.visibility = 'hidden';
        });
        
        //because no single group is selected, remove the picker message and show the full color spectrum
        document.getElementById('color-picker-label').innerHTML = '';
        fillSatLumCanvas([0, 1]);
        
        //show the empty state message depending on whether there are any colors in the palette
        if (colorsObjectIsEmpty(colors)) {
            document.getElementById('initial-message').style.display = 'block';
            document.getElementById('repeating-message').style.display = 'none';
        } else {
            document.getElementById('initial-message').style.display = 'none';
            document.getElementById('repeating-message').style.display = 'block';
        }
    };
    
    //takes in the colors objects and a number for the HSL component (0, 1 or 2) and sorts by the value of that component
    sortByHslComponent = function (colors, component) {
        
        Object.keys(colors).forEach(function (group) {
            var table, rows, switching, i, placeholderColor, shouldSwitch;

            table = document.getElementById(group);
            switching = true;

            /* Make a loop that will continue until no switching has been done: */
            while (switching) {
                switching = false;

                rows = table.rows;
                for (i = 0; i < (rows.length - 1); i += 1) {
                    shouldSwitch = false;
                    
                    //for light colors getting sorted by luminance, sort lightest to darkest. this will match the canvas
                    if (LIGHT_GROUPS.includes(group) && component === 2) {
                        if (rgbToNormalizedHsl(colors[group][i].rgb)[component] < rgbToNormalizedHsl(colors[group][i + 1].rgb)[component]) {
                            shouldSwitch = true;
                            break;
                        }
                    } else {
                        if (rgbToNormalizedHsl(colors[group][i].rgb)[component] > rgbToNormalizedHsl(colors[group][i + 1].rgb)[component]) {
                            shouldSwitch = true;
                            break;
                        }
                    }
                }

                if (shouldSwitch) {
                /* If a switch has been marked, make the switch and mark that a switch has been done: */
                    rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);

                    placeholderColor = colors[group][i];
                    colors[group][i] = colors[group][i + 1];
                    colors[group][i + 1] = placeholderColor;

                    switching = true;
                }
            }
        });
    };
    
    //FUNCTIONS FOR COLOR CONVERSION
    
    //takes in an array [r, g, b] range 0-255, and returns an array for normalized hsl [h, s, l] range 0-360 for hue and 0-1 for saturation and luminance
    rgbToNormalizedHsl = function (rgb) {
        var rNormalized, gNormalized, bNormalized, minComponent, maxComponent,
            rFactor = 0.2126, gFactor = 0.7152, bFactor = 0.0722,
            hue, saturation, luminancew;

        rNormalized = Math.pow(rgb[0] / 255, 2.2);
        gNormalized = Math.pow(rgb[1] / 255, 2.2);
        bNormalized = Math.pow(rgb[2] / 255, 2.2);

        minComponent = Math.min(rNormalized, Math.min(gNormalized, bNormalized));
        maxComponent = Math.max(rNormalized, Math.max(gNormalized, bNormalized));

        if (rNormalized === gNormalized && gNormalized === bNormalized) {
            hue = 0;
        } else {
            switch (maxComponent) {
            case rNormalized:
                hue = (gNormalized - bNormalized) / (maxComponent - minComponent) + (gNormalized < bNormalized ? 6 : 0);
                break;
            case gNormalized:
                hue = (bNormalized - rNormalized) / (maxComponent - minComponent) + 2;
                break;
            case bNormalized:
                hue = (rNormalized - gNormalized) / (maxComponent - minComponent) + 4;
                break;
            }
            hue *= 60;
        }

        luminancew = rNormalized * rFactor + gNormalized * gFactor + bNormalized * bFactor;

        if (luminancew === 0 || luminancew === 1) {
            saturation = 0;
        } else {
            saturation = Math.max((luminancew - minComponent) / luminancew, (maxComponent - luminancew) / (1 - luminancew));
        }

        return [hue, saturation, luminancew];
    };

    // takes in array of hue, saturation, luminancew: 0-360, 0-1, 0-1, and returns r, g, b values: 0 - 255
    normalizedHslToRgb = function (hsl) {

        var r, g, b, h, f1, f0, m,
            rFactor = 0.2126, gFactor = 0.7152, bFactor = 0.0722,
            redNormalized, greenNormalized, blueNormalized;

        if (hsl[0] < 60) {
            r = 1;
            g = 0;
            b = -1;
            f1 = rFactor;
            f0 = gFactor;
        } else if (hsl[0] < 120) {
            r = 0;
            g = 1;
            b = -1;
            f1 = gFactor;
            f0 = rFactor;
        } else if (hsl[0] < 180) {
            r = -1;
            g = 1;
            b = 0;
            f1 = gFactor;
            f0 = bFactor;
        } else if (hsl[0] < 240) {
            r = -1;
            g = 0;
            b = 1;
            f1 = bFactor;
            f0 = gFactor;
        } else if (hsl[0] < 300) {
            r = 0;
            g = -1;
            b = 1;
            f1 = bFactor;
            f0 = rFactor;
        } else {
            r = 1;
            g = -1;
            b = 0;
            f1 = rFactor;
            f0 = bFactor;
        }

        h = 1 - Math.abs((hsl[0] % 120) / 60 - 1);
        m = f1 + h * f0;  // (using fr,fg,fb from above)

        if (0 <= hsl[2] && hsl[2] <= m) {

            if (r >= g && g >= b) {
                redNormalized = hsl[2] + hsl[2] * hsl[1] * (1 - m) / m;
                greenNormalized = hsl[2] + hsl[2] * hsl[1] * (h - m) / m;
                blueNormalized = hsl[2] - hsl[2] * hsl[1];
            } else if (r >= b && b >= g) {
                redNormalized = hsl[2] + hsl[2] * hsl[1] * (1 - m) / m;
                blueNormalized = hsl[2] + hsl[2] * hsl[1] * (h - m) / m;
                greenNormalized = hsl[2] - hsl[2] * hsl[1];
            } else if (g >= r && r >= b) {
                greenNormalized = hsl[2] + hsl[2] * hsl[1] * (1 - m) / m;
                redNormalized = hsl[2] + hsl[2] * hsl[1] * (h - m) / m;
                blueNormalized = hsl[2] - hsl[2] * hsl[1];
            } else if (g >= b && b >= r) {
                greenNormalized = hsl[2] + hsl[2] * hsl[1] * (1 - m) / m;
                blueNormalized = hsl[2] + hsl[2] * hsl[1] * (h - m) / m;
                redNormalized = hsl[2] - hsl[2] * hsl[1];
            } else if (b >= r && r >= g) {
                blueNormalized = hsl[2] + hsl[2] * hsl[1] * (1 - m) / m;
                redNormalized = hsl[2] + hsl[2] * hsl[1] * (h - m) / m;
                greenNormalized = hsl[2] - hsl[2] * hsl[1];
            } else if (b >= g && g >= r) {
                blueNormalized = hsl[2] + hsl[2] * hsl[1] * (1 - m) / m;
                greenNormalized = hsl[2] + hsl[2] * hsl[1] * (h - m) / m;
                redNormalized = hsl[2] - hsl[2] * hsl[1];
            }
        } else if (m <= hsl[2] && hsl[2] <= 1) {
            if (r >= g && g >= b) {
                redNormalized = hsl[2] + (1 - hsl[2]) * hsl[1];
                greenNormalized = hsl[2] + (1 - hsl[2]) * hsl[1] * (h - m) / (1 - m);
                blueNormalized = hsl[2] - (1 - hsl[2]) * hsl[1] * m / (1 - m);
            } else if (r >= b && b >= g) {
                redNormalized = hsl[2] + (1 - hsl[2]) * hsl[1];
                blueNormalized = hsl[2] + (1 - hsl[2]) * hsl[1] * (h - m) / (1 - m);
                greenNormalized = hsl[2] - (1 - hsl[2]) * hsl[1] * m / (1 - m);
            } else if (g >= r && r >= b) {
                greenNormalized = hsl[2] + (1 - hsl[2]) * hsl[1];
                redNormalized = hsl[2] + (1 - hsl[2]) * hsl[1] * (h - m) / (1 - m);
                blueNormalized = hsl[2] - (1 - hsl[2]) * hsl[1] * m / (1 - m);
            } else if (g >= b && b >= r) {
                greenNormalized = hsl[2] + (1 - hsl[2]) * hsl[1];
                blueNormalized = hsl[2] + (1 - hsl[2]) * hsl[1] * (h - m) / (1 - m);
                redNormalized = hsl[2] - (1 - hsl[2]) * hsl[1] * m / (1 - m);
            } else if (b >= r && r >= g) {
                blueNormalized = hsl[2] + (1 - hsl[2]) * hsl[1];
                redNormalized = hsl[2] + (1 - hsl[2]) * hsl[1] * (h - m) / (1 - m);
                greenNormalized = hsl[2] - (1 - hsl[2]) * hsl[1] * m / (1 - m);
            } else if (b >= g && g >= r) {
                blueNormalized = hsl[2] + (1 - hsl[2]) * hsl[1];
                greenNormalized = hsl[2] + (1 - hsl[2]) * hsl[1] * (h - m) / (1 - m);
                redNormalized = hsl[2] - (1 - hsl[2]) * hsl[1] * m / (1 - m);
            }
        } else {
            window.console.log('error. color parameters probably out of range.');
        }
        
        //fudge factor because I was getting stray negative values that turned into NaN
        redNormalized = Math.max(0, Math.min(redNormalized, 255));
        greenNormalized = Math.max(0, Math.min(greenNormalized, 255));
        blueNormalized = Math.max(0, Math.min(blueNormalized, 255));

        return [parseInt(255 * Math.pow(redNormalized, 1 / 2.2), 10), parseInt(255 * Math.pow(greenNormalized, 1 / 2.2), 10), parseInt(255 * Math.pow(blueNormalized, 1 / 2.2), 10)];
    };

    //given a luminance, desired contrast value and direction (1 if the luminance is for the darker color, -1 if it's for a lighter color)
    //returns the luminance of a color with the desired contrast value
    getContrastingLuminance = function (luminance, desiredContrast, direction) {
        var contrastLuminance = 0;

       //C = (L1 + 0.05) / (L2 + 0.05) - L1 is lighter, L2 is darker
        if (direction === 1) { //this is a darker color contrasting with a lighter color
            contrastLuminance = (desiredContrast * (luminance + 0.05)) - 0.05;
        } else { //this is a lighter color contrasting with a darker color
            contrastLuminance = ((luminance + 0.05) / desiredContrast) - 0.05;
        }
        
        //it is possible for a user to choose colors so that the desired contrast isn't possible.
        //this keeps that situation from throwing an error.
        contrastLuminance = Math.min(Math.max(0, contrastLuminance), 1);
        
        return contrastLuminance;
    };

    //hsl to rgb using standard conversions. hsl are each 0-1, rgb is 0-255
    standardHslToRgb = function (hsl) {
        var h = hsl[0],
            s = hsl[1],
            l = hsl[2],
            r,
            g,
            b,
            hue2rgb,
            q,
            p;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            hue2rgb = function (p, q, t) {
                if (t < 0) {
                    t += 1;
                }
                if (t > 1) {
                    t -= 1;
                }
                if (t < 1 / 6) {
                    return p + (q - p) * 6 * t;
                }
                if (t < 1 / 2) {
                    return q;
                }
                if (t < 2 / 3) {
                    return p + (q - p) * (2 / 3 - t) * 6;
                }
                return p;
            };

            q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    };
    
    //takes an an array [r, g, b] and returns a 6-digit hex value
    rgbToHex = function (rgb) {
        var hexString = '';
        rgb.forEach(function (val) {
            var hex = Number(val).toString(16);
            if (hex.length < 2) {
                hex = '0' + hex;
            }
            hexString += hex;
        });
        return hexString;
    };
    
    //takes a hex string and returns the corresponding rgb value as an array [r, g, b]
    hexToRgb = function (hex) {
        var m = null;
        
        if (hex.charAt(0) === '#') {
            hex = hex.substring(1);
        }
        
        if (hex.length === 3) {
            m = hex.match(/([0-9a-f]{3})$/i);
            if (m !== null) {
                return [parseInt(m[0].charAt(0), 16) * 0x11, parseInt(m[0].charAt(1), 16) * 0x11, parseInt(m[0].charAt(2), 16) * 0x11];
            } else {
                return null;
            }
        } else if (hex.length === 6) {
            m = hex.match(/([0-9a-f]{6})$/i);
            if (m !== null) {
                return [parseInt(m[0].substring(0, 2), 16), parseInt(m[0].substring(2, 4), 16), parseInt(m[0].substring(4, 6), 16)];
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    //takes in an array [r, g, b] and checks if every value is between 0 and 255
    isValidRgb = function (rgb) {
        var valid = true;
        rgb.forEach(function (val) {
            if (val === '' || val < 0 || val >= 256) {
                valid = false;
            }
        });
        return valid;
    };

    //takes in an array [hue, sat, lum] and checks if hue is between 0 and 360, and sat and lum are between 0 and 1
    isValidHsl = function (hsl) {

        if (hsl[0] === '' || hsl[0] < 0 || hsl[0] > 360) {
            return false;
        }
        if (hsl[1] === '' || hsl[1] < 0 || hsl[1] > 1) {
            return false;
        }
        if (hsl[2] === '' || hsl[2] < 0 || hsl[2] > 1) {
            return false;
        }
        return true;
    };

    //takes an RGB color array [r,g,b] (0-255 range) and returns its luminance
    //this is the STANDARD method, not the normalized method I'm using for the color picker
    evaluateLuminance = function (rgb) {
        // http://www.w3.org/TR/WCAG20/#relativeluminancedef    
        var normalizedRgb, i, chan;
        
        normalizedRgb = [rgb[0], rgb[1], rgb[2]];
        
        for (i = 0; i < rgb.length; i = i + 1) {
            chan = normalizedRgb[i] / 255;
            normalizedRgb[i] = (chan <= 0.03928) ? chan / 12.92 : Math.pow(((chan + 0.055) / 1.055), 2.4);
        }
        return 0.2126 * normalizedRgb[0] + 0.7152 * normalizedRgb[1] + 0.0722 * normalizedRgb[2];
    };
    
    //takes in a standard luminance and (roughly) converts it to normalized luminance.
    convertLuminanceToNormalizedLuminance = function (lum) {
        var dummyRgbValue, interimRgbValue, normalizedLuminance;
        
        //uses a semi-arbitrary threshhold value where r, g, and b are all at the cutoff point of 0.03928, which results in the luminance below
        //because this cutoff point assumes r = g = b, the factorization doesn't come into play (rFactor + gFactor + bFactor = 1), which simplifies the calculations
        
        if (lum <= 0.00304024767801858) {
            dummyRgbValue = 12.92 * lum; //reverses the luminance calculation for low values
            
        } else {
            interimRgbValue = Math.pow(lum, 1 / 2.4); //reverses the luminance calculation for higher values
            dummyRgbValue = (1.055 * interimRgbValue) - 0.055;
        }
        
        //calculate the normalized luminance for r=g=b (no factorization needed)
        normalizedLuminance = Math.pow(dummyRgbValue, 2.2);
        
        return normalizedLuminance;
    };
    
    //takes 2 RGB color arrays [r,g,b] (0-255 range) and returns their contrast value
    evaluateContrast = function (c1, c2) {
        // http://www.w3.org/TR/WCAG20/#contrast-ratiodef
        var lum1 = evaluateLuminance(c1),
            lum2 = evaluateLuminance(c2);
        if (lum1 > lum2) {
            return (lum1 + 0.05) / (lum2 + 0.05);
        }
        return (lum2 + 0.05) / (lum1 + 0.05);
    };

    //takes a contrast value (0-21) and returns a text string corresponding to WCAG score
    interpretContrast = function (ct) {
        if (ct < 3) {
            return 'Fail';
        }
        if (ct < 4.5) {
            return 'AA large';
        }
        if (ct < 7) {
            return 'AA';
        }
        return 'AAA';
    };

    //given two colors, returns a string with both the rating and value
    getContrastRatingAndValue = function (c1, c2) {
        var contrast = evaluateContrast(c1, c2);
        return interpretContrast(contrast) + '<br>' + contrast.toFixed(2);
    };
    
    //given a group, looks at the contrasting groups and calculates the range for luminance that would allow
    //a new color to meet the desired contrast values against all the colors in the contrasting groups
    calculateLuminanceRange = function (selectedGroup) {
        var direction, bottomContrastLum, topContrastLum, AAComparisonLum, AALargeComparisonLum;
        
        
        //for each group, get the min or max (standard) luminance we'll be contrasting against
        //calculate the contrasting luminance
        //convert that luminance to the normalized luminance we use in the graph
        

        switch (selectedGroup) {
        case 'high-contrast-dark':
            direction = -1; //luminance goes DOWN from a higher value on the bottom of the graph to 0 at the top
            
            //for the bottom of the graph, we need the highest luminance that will meet AA contrast against all core light colors, and AA_LARGE contrast against all headline light colors
                
            //find the lowest luminance for all colors in the high-contrast-light group. The luminance that contrasts against this will also meet AA for all lighter colors.
            AAComparisonLum = 1;
            colors['high-contrast-light'].forEach(function (color) {
                var lum = evaluateLuminance(color.rgb);
                if (lum < AAComparisonLum) {
                    AAComparisonLum = lum;
                }
            });
                
            //find the lowest luminance for all colors in the low-contrast-light group. The luminance that contrasts against this will also meet AA_LARGE for all lighter colors.
            AALargeComparisonLum = 1;
            colors['low-contrast-light'].forEach(function (color) {
                var lum = evaluateLuminance(color.rgb);
                if (lum < AALargeComparisonLum) {
                    AALargeComparisonLum = lum;
                }
            });
            
            //the bottom contrast luminance is the lower of the luminance to meet AA against high-contrast-light and the luminance to meet AA_LARGE against low-contrast-light
            bottomContrastLum = Math.min(getContrastingLuminance(AAComparisonLum, AA, direction), getContrastingLuminance(AALargeComparisonLum, AA_LARGE, direction));
                
            topContrastLum = 0; //high-contrast-dark colors go all the way to 0 luminance
            break;
                
        case 'low-contrast-dark':
            direction = -1; //luminance goes DOWN from a higher value on the bottom of the graph to a lower value at the top
                
            //for the bottom of the graph, we need the highest luminance that will meet AA_LARGE contrast against all high-contrast-light colors
                
            //find the lowest luminance for all colors in the high-contrast-light group. The luminance that contrasts against this will also meet AA_LARGE for all lighter colors.
            AALargeComparisonLum = 1;
            colors['high-contrast-light'].forEach(function (color) {
                var thisLum = evaluateLuminance(color.rgb);
                if (thisLum < AALargeComparisonLum) {
                    AALargeComparisonLum = thisLum;
                }
            });
  
            //find the luminance that will keep all contrasting colors in the AA_LARGE contrast range
            bottomContrastLum = getContrastingLuminance(AALargeComparisonLum, AA_LARGE, direction);
                
            /*for the top of the graph, there are two requirements:
            if possible, the luminance at the top of the graph should be light enough that it is worse than AA against the darkest high-contrast-light color
            but in some cases, changing the high-contrast-light palette will mean that there's an existing low-contrast-dark color that is dark enough to be AA gainst all high-contrast-light colors. Make sure the top of the color picker is dark enough to include that color.
            */
                
            topContrastLum = getContrastingLuminance(AALargeComparisonLum, AA, direction);

            colors['low-contrast-dark'].forEach(function (color) {
                var thisLum = evaluateLuminance(color.rgb);
                if (thisLum < topContrastLum) {
                    topContrastLum = thisLum;
                }
            });
            break;
                
        case 'high-contrast-light':
            direction = 1; //luminance goes UP from a lower value on the bottom of the graph to 1 at the top
            
            //for the bottom of the graph, we need the lowest luminance that will meet AA contrast against all core dark colors, and AA_LARGE contrast against all headline dark colors
                
            //find the highest luminance for all colors in the high-contrast-dark group. The luminance that contrasts against this will also meet AA for all darker colors.
            AAComparisonLum = 0;
            colors['high-contrast-dark'].forEach(function (color) {
                var lum = evaluateLuminance(color.rgb);
                if (lum > AAComparisonLum) {
                    AAComparisonLum = lum;
                }
            });
             
            //find the highest luminance for all colors in the low-contrast-light group. The luminance that contrasts against this will also meet AA_LARGE for all darker colors.
            AALargeComparisonLum = 0;
            colors['low-contrast-dark'].forEach(function (color) {
                var lum = evaluateLuminance(color.rgb);
                if (lum > AALargeComparisonLum) {
                    AALargeComparisonLum = lum;
                }
            });
                
            //the bottom contrast luminance is the higher of the luminance to meet AA against high-contrast-dark and the luminance to meet AA_LARGE against low-contrast-dark
            bottomContrastLum = Math.max(getContrastingLuminance(AAComparisonLum, AA, direction), getContrastingLuminance(AALargeComparisonLum, AA_LARGE, direction));
            
            topContrastLum = 1; //high-contrast-light colors go all the way to 1 luminance
            break;
                
        case 'low-contrast-light':
            direction = 1; //luminance goes UP from a lower value on the bottom of the graph to a higher value at the top
                
            //for the bottom of the graph, we need the lowest luminance that will meet AA_LARGE contrast against all high-contrast-dark colors
                
            //find the highest luminance for all colors in the high-contrast-dark group. The luminance that contrasts against this will also meet AA_LARGE for all darker colors.
            AALargeComparisonLum = 0;

            colors['high-contrast-dark'].forEach(function (color) {
                var thisLum = evaluateLuminance(color.rgb);
                if (thisLum > AALargeComparisonLum) {
                    AALargeComparisonLum = thisLum;
                }
            });
        
            //find the luminance that will keep all contrasting colors in the AA_LARGE contrast range
            bottomContrastLum = Math.min(1, getContrastingLuminance(AALargeComparisonLum, AA_LARGE, direction));
                
            /*for the top of the graph, there are two requirements:
            if possible, the luminance at the top of the graph should be dark enough that it is worse than AA against the lightest high-contrast-dark color
            but in some cases, changing the high-contrast-dark palette will mean that there's an existing low-contrast-light color that is light enough to be AA gainst all high-contrast-dark colors. Make sure the top of the color picker is dark enough to include that color.
            */
                
            topContrastLum = getContrastingLuminance(AALargeComparisonLum, AA, direction);

            colors['low-contrast-light'].forEach(function (color) {
                var thisLum = evaluateLuminance(color.rgb);
                if (thisLum > topContrastLum) {
                    topContrastLum = thisLum;
                }
            });
            break;
        }
        
        //now we have top and bottom contrast luminances in the standard format. We need to convert these to the simpler format that lets
        //us make the graph more easily
        
        bottomContrastLum = convertLuminanceToNormalizedLuminance(bottomContrastLum);
        topContrastLum = convertLuminanceToNormalizedLuminance(topContrastLum);
        
        //small fudge factor to account for imperfect conversions
        if (bottomContrastLum < topContrastLum) {
            bottomContrastLum = bottomContrastLum * 0.96;
            topContrastLum = Math.min(1, topContrastLum * 1.04);
        } else {
            bottomContrastLum = Math.min(1, bottomContrastLum * 1.04);
            topContrastLum = topContrastLum * 0.96;
        }
        
        return [bottomContrastLum, topContrastLum];
    };
    
    //given a lumRange value, calculates an increment betwen luminance values over the satLumCanvas
    getLumIncrement = function (lumRange) {
        var canvasHeight = document.getElementById('sat-lum-canvas').getBoundingClientRect().height,
            sensitivity, //range 0-1. lower sensitivity => smaller steps
            lumIncrement;
        
        //a strange and imperfect fudge, because you need bigger steps at higher lum
        //there's probably a real relationship involving the power of 2.2
        sensitivity = Math.max(0.3, Math.max(lumRange[0], lumRange[1]));
    
        if (lumRange[0] > lumRange[1]) {
            if (lumRange[0] === 0) {
                lumIncrement = canvasHeight;
            } else {
                lumIncrement = Math.max(2, Math.min(Math.floor(sensitivity / (lumRange[0] - lumRange[1])), canvasHeight));
            }
        } else {
            if (lumRange[0] === lumRange[1]) {
                lumIncrement = canvasHeight;
            } else {
                lumIncrement = Math.max(2, Math.min(Math.floor(sensitivity / (lumRange[1] - lumRange[0])), canvasHeight));
            }
        }
        return lumIncrement;
    };
    
    
    //FUNCTIONS FOR SAVING AND LOADING FILES
        
    //Saves the data to local storage
    saveToLocalStorage = function (colors) {
        if (typeof (Storage) !== 'undefined') {
            
            var arrayIndex, saveString = '';

            Object.keys(colors).forEach(function (group) {
                for (arrayIndex = colors[group].length - 1; arrayIndex >= 0; arrayIndex -= 1) {
                    saveString = saveString + group + ',' + colors[group][arrayIndex].rgb[0] + ',' + colors[group][arrayIndex].rgb[1] + ',' + colors[group][arrayIndex].rgb[2] + ',' + colors[group][arrayIndex].name + '\n';
                }
            });
            window.localStorage.setItem('colorData', saveString);
        }
    };
    
    //Load data from local storage and add it to the interface
    loadFromLocalStorage = function () {
        var colorData, colorString;
        
        //reset the colors object
        colors['low-contrast-dark'] = [];
        colors['high-contrast-dark'] = [];
        colors['high-contrast-light'] = [];
        colors['low-contrast-light'] = [];
        
        if (typeof (Storage) !== 'undefined') { //if the browser supports local storage
            colorData = window.localStorage.getItem('colorData');
            
            if (colorData !== null) {
                colorString = window.localStorage.getItem('colorData').split('\n');

                colorString.forEach(function (color) {
                    var newColor = {}, loadedColor = color.split(',');
                    if (loadedColor.length === 5 && ['low-contrast-dark', 'high-contrast-dark', 'high-contrast-light', 'low-contrast-light'].includes(loadedColor[0])) {
                        newColor.name = loadedColor[4];
                        newColor.rgb = [loadedColor[1], loadedColor[2], loadedColor[3]];
                        newColor.lum = rgbToNormalizedHsl([loadedColor[1], loadedColor[2], loadedColor[3]])[2];
                        addColor(newColor, loadedColor[0]);
                    }
                });
            }
        }
    };
    
    //opens the file picker and loads a saved file
    openColorGroupFile = function () {
        
        //creates and clicks on a dummy file input. A hack.
        var fileLoadElement = document.createElement('input');
        fileLoadElement.type = 'file';
        fileLoadElement.accept = '.csv';
        fileLoadElement.value = '';
        
        fileLoadElement.onchange = function () {
            var file = this.files[0],
                reader = new window.FileReader(),
                colorString = '';

            reader.onload = function () {

                var rawData = reader.result,
                    anyValidColors = false;

                colorString = rawData.split('\n');

                if (colorString.length > 0) {

                    colorString.slice(1).forEach(function (color) {
                        var validResult = true,
                            newColor,
                            loadedColors = color.split(',');

                        //check that the line is in valid color format
                        if (loadedColors.length === 5) {

                            if (!(isValidRgb([loadedColors[1], loadedColors[2], loadedColors[3]]) && ['high-contrast-dark', 'low-contrast-dark', 'high-contrast-light', 'low-contrast-light'].includes(loadedColors[0]))) {
                                window.console.log('not valid');
                                validResult = false;
                            }

                            //if the line is a valid color, add it
                            if (validResult === true) {

                                //if this is the first valid color, clear the previous colors to prepare for the new ones
                                if (!anyValidColors) {
                                    clearColors();
                                    anyValidColors = true;
                                }

                                newColor = {};
                                newColor.name = loadedColors[4];
                                newColor.rgb = [loadedColors[1], loadedColors[2], loadedColors[3]];
                                newColor.lum = rgbToNormalizedHsl([loadedColors[1], loadedColors[2], loadedColors[3]])[2];
                                addColor(newColor, loadedColors[0]);
                                
                                setEmptyState();
                            }
                        }
                    });
                    saveToLocalStorage(colors);

                    if (!anyValidColors) {
                        window.alert('Error. The file may not be in the right format, or there may not be any colors in it.');
                    }
                }
            };
            reader.readAsBinaryString(file);
        };
        
        //generate a click on the dummy file input
        fileLoadElement.click();
        fileLoadElement.remove();
    };
    
    //takes in the colors object and saves the information into a CSV file
    saveAsCSV = function (colors) {
        var arrayIndex, saveString = '';

        Object.keys(colors).forEach(function (group) {
            for (arrayIndex = colors[group].length - 1; arrayIndex >= 0; arrayIndex -= 1) {
                saveString = saveString + group + ',' + colors[group][arrayIndex].rgb[0] + ',' + colors[group][arrayIndex].rgb[1] + ',' + colors[group][arrayIndex].rgb[2] + ',' + colors[group][arrayIndex].name + '\n';
            }
        });
                                
        if (saveString !== '') {
            saveString = 'group, red, green, blue, name\n' + saveString;
            downloadBlob(saveString, 'pal_' + timestamp() + '.csv', 'text/csv');
        }
	};
    
    //save the colors objects into an ASE file
    //TODO: group the colors into their respective groups
    saveAsASE = function (colors) {
    
        var buffer,
            view,
            flattenedData = [],
            allStringsLength = 0,
            bufferLength,
            byteIndex = 0;

        //calculate the length of the buffer needed for the ASE file
        //signature: 4 bytes
        //version: 4 bytes
        //number of blocks: 4 bytes
        //FOR EACH BLOCK - colorData.length
        //block start indicator: 2 bytes
        //block size: 4 bytes
        //name string length: 2 bytes
        //name string: 2*(color[3].length + 1) (different for each color)
        //color mode: 4 bytes
        //RGB color values: 3*4 bytes
        //type: 1 byte
        //padding: 1 byte
        
        Object.keys(colors).forEach(function (group) {
            colors[group].forEach(function (color) {
                flattenedData.push(color);
                allStringsLength += color.name.length + 1;
            });
        });

        bufferLength = 4 + 4 + 4 + flattenedData.length * (2 + 4 + 2  + 4 + 12 + 2) + 2 * allStringsLength;

        // create an ArrayBuffer with a size in bytes
        buffer = new ArrayBuffer(bufferLength);
        view = new DataView(buffer);

        //Set file signature ASEF as the first 4 characters
        [].forEach.call('ASEF', function (character, index) {
            view.setUint8(index, character.charCodeAt(0));
        });
        byteIndex += 4;

        //Set the version to be 1.0
        view.setInt16(byteIndex, 1);
        byteIndex += 2;
        view.setInt16(byteIndex, 0);
        byteIndex += 2;

        //Set the number of blocks, equal to the number of colors
        view.setInt32(byteIndex, flattenedData.length);
        byteIndex += 4;

        //for each block (each block represents a single color)
        flattenedData.forEach(function (color) {

            //indicate the start of a block through 2 bytes 0x01?
            view.setInt16(byteIndex, 1);
            byteIndex += 2;

            //calculate the size of this block (not including this or previous bytes)
            //2 bytes for the blocks indicating the string length
            //2 bytes per character, plus 2 terminal bytes, for the name string: colorData[0][3].length
            //4 bytes for the color mode
            //12 bytes for red, green and blue (4 bytes each) (could be different for different color mode)
            view.setInt32(byteIndex, 20 + 2 * (color.name.length + 1));
            byteIndex += 4;

            //name string length - note this is for the string with a terminal blank, not the number of bytes
            view.setInt16(byteIndex, color.name.length + 1);
            byteIndex += 2;

            color.name.split('').forEach(function (character) {
                view.setUint8(byteIndex, 0);
                view.setUint8(byteIndex + 1, character.charCodeAt(0));
                byteIndex += 2;
            });
            view.setInt16(byteIndex, 0);
            byteIndex += 2;

            //Set the color mode to RGB in 4 bytes
            view.setUint8(byteIndex, 'R'.charCodeAt(0));
            byteIndex += 1;
            view.setUint8(byteIndex, 'G'.charCodeAt(0));
            byteIndex += 1;
            view.setUint8(byteIndex, 'B'.charCodeAt(0));
            byteIndex += 1;
            view.setUint8(byteIndex, ' '.charCodeAt(0));
            byteIndex += 1;

            //Set the color values. Finally!
            view.setFloat32(byteIndex, color.rgb[0] / 255);
            byteIndex += 4;
            view.setFloat32(byteIndex, color.rgb[1] / 255);
            byteIndex += 4;
            view.setFloat32(byteIndex, color.rgb[2] / 255);
            byteIndex += 4;

            //Set the color type
            view.setUint8(byteIndex, 0); //global color, seems safest.
            byteIndex += 1;

            //final padding byte
            view.setUint8(byteIndex, 0);
            byteIndex += 1;
        });

        downloadBlob(buffer, 'pal_' + timestamp() + '.ase', 'application/octet-stream');
    };
    
    //save teh colors object as a sketchgroup file
    saveForSketch = function (colors) {
        var colorGroup = [],
            fileData,
            saveString;
        
        Object.keys(colors).forEach(function (group) {
            colors[group].forEach(function (color) {
                colorGroup.push({
                    red: color.rgb[0] / 255,
                    green: color.rgb[1] / 255,
                    blue: color.rgb[2] / 255,
                    alpha: 1
                });
            });
        });

        fileData = {
            'compatibleVersion': '2.0', // min plugin version to load group
            'pluginVersion': '2.14', //  version at the time this code was written
            'colors': colorGroup,
            'gradients': [],
            'images':  []
        };

        // Write file to chosen file path
        saveString = JSON.stringify(fileData);
        
        downloadBlob(saveString, 'pal_' + timestamp() + '.sketchgroup');
    };

    //generate a timestamp for unique file names
    timestamp = function () {
        var d = new Date(),
            yr = (d.getFullYear() % 100).toString(),
            mo = (d.getMonth() + 1).toString(),
            dy = d.getDate().toString(),
            hr = d.getHours().toString(),
            mi = d.getMinutes().toString();
        
        if (mo.length < 2) {
            mo = '0' + mo;
        }
        if (dy.length < 2) {
            dy = '0' + dy;
        }
        
        if (hr.length < 2) {
            hr = '0' + hr;
        }
        if (mi.length < 2) {
            mi = '0' + mi;
        }
        return yr + mo + dy + hr + mi;
    };
    
    //download the information (blob) into a file with given fileName and mimeType
    downloadBlob = function (data, fileName, mimeType) {
        var blob, url;
        blob = new Blob([data], {
            type: mimeType
        });
        url = window.URL.createObjectURL(blob);
        downloadURL(url, fileName);
        window.setTimeout(function () {
            return window.URL.revokeObjectURL(url);
        }, 1000);
    };
    
    //automatically downloads a file locally, by creating then emulating a click on a link
    //a bit hacky, but seemed the simplest way to get a file saved locally
    downloadURL = function (data, fileName) {
        var a;
        a = document.createElement('a');
        a.href = data;
        a.download = fileName;
        document.body.appendChild(a);
        a.style = 'display: none';
        a.click();
        a.remove();
    };
    
    //FUNCTIONS FOR MANAGING MODALS
    showModal = function (modalId) {
        document.getElementById('modal-background').style.display = 'block';
        document.getElementById(modalId).style.display = 'block';
        
        document.getElementById('menu-container').style.display = 'none';
        document.getElementById('main-interface-container').style.display = 'none';
        
        if (modalId === 'overview-modal') {
            generateGroupOverview(colors);
        }
    };
    
    hideModal = function (modalId) {
        document.getElementById('modal-background').style.display = 'none';
        document.getElementById(modalId).style.display = 'none';
        
        document.getElementById('menu-container').style.display = 'block';
        document.getElementById('main-interface-container').style.display = 'block';
    };
    
    hideModals = function () {
        document.getElementById('modal-background').style.display = 'none';
        Array.prototype.forEach.call(document.getElementsByClassName('modal-window'), function (modal) {
            modal.style.display = 'none';
        });
        
        document.getElementById('menu-container').style.display = 'block';
        document.getElementById('main-interface-container').style.display = 'block';
    };
    
    generateGroupOverview = function (colors) {
        var overviewTable = document.getElementById('overview-table'),
            rowCount = Math.floor((document.getElementById('overview-modal').getBoundingClientRect().width - 48 - 48 - 132) / 126);
        
        overviewTable.innerHTML = '';
        
        Object.keys(colors).forEach(function (group) {
            
            var row = document.createElement('TR'),
                header = document.createElement('TH');
            
            row.className = 'overview-row';
            header.className = 'overview-header';
            
            switch (group) {
            case 'high-contrast-dark':
                header.innerHTML = '<strong>Dark high-contrast</strong><br>AA when paired with<br>light high-contrast';
                break;
            case 'high-contrast-light':
                header.innerHTML = '<strong>Light high-contrast</strong><br>AA when paired with<br>dark high-contrast';
                break;
            case 'low-contrast-dark':
                header.innerHTML = '<strong>Dark medium-contrast</strong><br>AA Large when paired<br>with light high-contrast';
                break;
            case 'low-contrast-light':
                header.innerHTML = '<strong>Light medium-contrast</strong><br>AA Large when paired<br>with dark high-contrast';
                break;
            }
            
            row.appendChild(header);

            colors[group].forEach(function (color, index) {
                
                if (index > 0 && index % rowCount === 0) {
                    overviewTable.appendChild(row);
                    row = document.createElement('TR');
                    row.appendChild(document.createElement('TH'));
                }
                
                var item = document.createElement('TD');
                item.className = 'overview-item';
                if (index < rowCount) {
                    item.classList.add('top-row-for-group');
                }
                item.style.backgroundColor = 'rgb(' + colors[group][index].rgb + ')';
                if (DARK_GROUPS.includes(group)) {
                    item.style.color = 'white';
                } else {
                    item.style.color = 'black';
                }
                item.innerHTML = colors[group][index].rgb[0] + ', ' + colors[group][index].rgb[1] + ', ' + colors[group][index].rgb[2] + '<br>#' + rgbToHex(colors[group][index].rgb);
                
                row.appendChild(item);
            });
            overviewTable.appendChild(row);
        });
    };
    
}());