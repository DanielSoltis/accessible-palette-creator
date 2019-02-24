# Accessible Palette Creator

The Accessible Palette Creator is a tool for building color palettes to meet <a href = 'https://www.w3.org/TR/WCAG21/' target='_blank'>Web Content Accessibility Guidelines</a> for color contrast. 

The tool divides colors into four groups: dark high contrast and dark medium contrast, and light high contrast and light medium contrast. (In use, this could be light text on a dark background, or dark text on a light background.) Within each group, the color picker limits available colors so that pairs of dark and light colors meet accessibility guidelines as shown:

![alt Diagram illustrating the contrast values between each group of colors. This is explained in the next paragraph.](https://github.com/DanielSoltis/accessible-palette-creator/blob/master/images/colorpairdiagram.png)

This tool is intended to create fairly bulletproof palettes. Every dark+light pair of high contrast colors is AA or better, and every dark+light pair of a high contrast and a medium contrast color is AA Large or better. While this constrains choices in creating the palette, it allows for a lot of flexibility in using the palette.

<h2>Basic instructions</h2>

The interface works best on laptop or larger screen.

To add a color, select the ‘New color’ button in one of the four groups. Use the color picker to choose a color. In addition to using the color grid, you can enter values for hex, RGB or <a href = 'https://accessibility.kde.org/hsl-adjusted.php' target='_blank'>normalized HSL</a>. Click ‘Add’ or ‘Save’ to add the color to the palette.

To modify or delete an existing color, click on it. Click on ‘Update color’ or ’Save’ to save any changes, or ‘Cancel’ to deselect the color and revert to its original value.

‘Save palette’ and ‘Open palette’ download/upload CSV files. You can export to .ASE (for Adobe) and .sketchpalette (for Sketch with the <a href = 'https://github.com/andrewfiorillo/sketch-palettes' target='_blank'>Sketch Palettes plugin</a>). These save the color values but not the groupings, so the files can’t be used to reopen the palette in the tool.
</p>

<h2>Keyboard shortcuts</h2>

<ul>
    <li><em>Enter</em> to save a color</li>
    <li><em>Escape</em> to deselect a button or close a modal window</li>
    <li>If you select the thumb for hue or saturation/luminance, <em>arrow keys</em> move its position</li>
    <li>If you hover over an existing color and hit the <em>space bar</em>, the picker will adjust to match that color (if you’re in the same group) or the hue and saturation values of that color (if you’re in a different group)</li>
</ul>

<h2>How it works</h2>

The color picker uses a variation of an HSL colorspace to show available colors. For a given hue, the picker shows a grid of colors according to saturation (horizontal axis) and luminosity (vertical axis).

Saturation and luminosity values are normalized using <a href = 'https://accessibility.kde.org/hsl-adjusted.php' target='_blank'>KDE's calculations</a>, so that for any given luminosity value, the contrast against another color is (almost) the same. This lets the tool build the color picker without having to calculate the relative luminance for every color (which would take forever). 
However, it’s not a perfect match with the <a href = 'https://www.w3.org/TR/WCAG21/#dfn-relative-luminance' target='_blank'>calculation used in the WCAG standard</a>. It gives a good ballpark range, but if you want to use a color at the top or bottom of the picker, <em>keep an eye on the actual contrast value against other colors in the palette</em>.
