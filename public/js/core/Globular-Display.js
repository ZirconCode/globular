"use strict";
/*global gProject*/
/*global Timer*/
/*global detectLeftButton*/
/*global $*/

/*
    A Display class for rendering diagrams.
    
    Members:
        - suppress : N, levels to supress
        - coordinates : Array, indices of the display positions
        - container: div to render 
        - control: div for controls
*/

// Constructor
class DisplayManager {

    constructor(container) {
        this['_t'] = 'DisplayManager';
        this.container = $(container);
        this.display = null;
        this.displayControls = null;
        this.displayType = null;
        this.diagram = null;
        
        this.suppressInput = null;
        this.viewInput = null;
        this.sliceInputs = [];

        this.createControls();
    }

    setDisplay(type) {
        if (this.displayType === type) {
            return;
        }

        if (this.display !== null) {
            this.display.dispose();
            if (this.displayControls !== null) this.displayControls.empty();
        }

        if (type === "2d-svg") this.display = new DisplaySVG();
        else if (type === "2d-animated") this.display = new Display3D(2, true);
        else if (type === "3d") this.display = new Display3D(3, false);
        else if (type === "3d-animated") this.display = new Display3D(3, true);
        else throw new Error(`Unsupported display type ${type}.`);

        this.displayType = type;
        this.display.setup(this);
        
        this.removeControls();
        this.setDiagram({ diagram: this.diagram, preserve_view: false });
    }

    hasControls() {
        return this.container.children('div.control').length > 0;
    }

    /**
     * Make sure all the coordinates and suppressions make sense, bearing in mind
     * that an attachment has just been performed at the specified location,
     * so we want to keep it in view.
     */
    updateControls(drag, controls) {
        // If there's no diagram, nothing to do
        if (this.diagram == null) return;

        // Create controls, if there are none
        if (!this.hasControls()) this.createControls();

        // Update the suppression input
        var suppress = this.suppressInput.val();
        if (controls != null) suppress = controls.project;
        suppress = Math.min(suppress, this.diagram.n);
        if (suppress < 0) suppress = 0;
        this.suppressInput.val(suppress);
        update_control_width(this.suppressInput);

        // Update the view dimension input
        if (this.viewInput != null) {
            var view = Number(this.viewInput.val());
            if (drag != undefined) {
                if (drag.boost) view++;
            }
            view = Math.min(this.display.getMaximumDimension(), view, this.diagram.n - suppress);
            this.viewInput.val(view);
            update_control_width(view);
        }

        // Update the slice controls
        this.updateSliceContainer(drag, controls);

        // Update the display controls
        this.display.updateControls();
    }

    changeSliceSpinner(event, ui) {
        let spinner = $(event.currentTarget);
        let up = event.originalEvent.currentTarget.classList.contains('ui-spinner-up');
        let value = spinner.val();
        let position = Globular.parseSlice(value);
        _assert(position); 
        let new_position = Globular.moveSlice(position, up ? 1 : -1);
        let new_value = Globular.generateSlice(new_position);
        spinner.val(new_value);
        this.changeControls();
        return false;
    }

    changeControls(event, ui) {
        gProject.clearThumbnails();
        this.updateControls();
        this.render();
    }

    createControls() {
        let c = this.container;

        // Remove any existing controls
        this.removeControls();

        // Create no controls if there is no active display
        if (this.display === null) return;

        // Choose popout mode if the display is small
        let popout = (c.width() < 100 || c.height() < 100);

        // Construct the main control div
        this.control = $('<div>')
            .attr('id', 'main_view_control')
            .addClass('control')
            .addClass(popout ? 'popout' : 'inline')
            .mousedown((e) => e.stopPropagation())
            .mouseup((e) => e.stopPropagation())
            .click((e) => e.stopPropagation());
        this.container.append(this.control);

        // Construct the project control
        this.control.append(document.createTextNode('Project '));
        this.suppressInput = $('<input>')
            .attr('type', 'number')
            .addClass('control')
            .attr('min', 0)
            .mouseover((e) => e.target.focus());
        
        this.suppressInput.on('input', (event) => {
            $('#view_input').val(10);
            this.changeControls(event)
        });
        this.control.append(this.suppressInput);
        update_control_width(this.suppressInput);

        // Create a container for display specific controls
        this.displayControls = $("<div>").addClass("display_controls");
        this.control.append(this.displayControls);

        // Construct the container for the slice controls
        this.sliceDiv = $('<div>').addClass('slice_container');
        this.sliceDiv.append(document.createTextNode('Slice '));
        this.control.append(this.sliceDiv);
        this.sliceInputs = [];

        // Create the display specific controls
        this.display.createControls();
    }

    removeControls() {
        $(this.container).children('div.control').remove();
    }

    updateSliceContainer(drag, controls) {
        // If the diagram is null, we shouldn't have any slice controls
        if (this.diagram == null) {
            this.sliceInputs.forEach(input => input.remove());
            this.sliceInputs = [];
            return;
        }

        // Calculate the desired number of slice controls
        let remainingDimensions = this.diagram.n - this.getSuppress() - this.display.getMaximumDimension() /*this.view_input.val()*/ ;
        if (remainingDimensions < 0) remainingDimensions = 0;

        // Remove any superfluous slice controls
        while (this.sliceInputs.length > remainingDimensions) {
            this.sliceInputs.last().remove();
            this.sliceInputs.pop();
        }

        // Add any additional slice controls with a dimension of zero
        var self = this;
        for (var i = this.sliceInputs.length; i < remainingDimensions; i++) {
            this.sliceInputs[i] =
                $('<input>')
                //.spinner(/*{min:0}*/)
                .addClass('control')
                .addClass('slice')
                /*
                .attr('type', 'number')
                .attr('min', 0)
                */
                .val(0)
                .attr("index", i)
                //.on('input', event => this.changeControls(event))
                .on('spinstart', (event, ui) => this.changeSliceSpinner(event, ui))
                //.on('spin', function( event, ui ) {this.spinSlice(event, ui)})
                .hover(
                    // Mouse over
                    (event) => {
                        event.target.focus();
                        let index = Number(event.target.getAttribute("index"));
                        this.highlightSlice(index);
                    },
                    // Mouse out
                    (event) => {
                        this.removeHighlight();
                    });

            // Store the index of the slice control
            this.sliceDiv.append(this.sliceInputs[i]);
            this.sliceInputs[i].spinner({min:0}); // Must do it after appending
            update_control_width(this.sliceInputs[i]);
        }

        // If a particular boundary has been requested, make sure it is within view
        if (drag != null) {
            if (drag.boundary == null) {
                // Rewrite in the interior, so advance the last slider
                if (this.sliceInputs.length > 0) {
                    var counter = this.sliceInputs.last();
                    var current = Number(counter.val());
                    counter.val(current + 1);
                    update_control_width(counter);
                }
            } else {
                if (drag.boundary.depth > 0) {
                    var slice_index = drag.boundary.depth - 1;
                    if (drag.boundary.type == 't') {
                        if (slice_index < this.sliceInputs.length) {
                            var current = Number(this.sliceInputs[slice_index].val());
                            this.sliceInputs[slice_index].val(current + 1);
                            update_control_width(this.sliceInputs[slice_index]);
                        }
                    }
                }
            }
        }

        // Ensure the slice coordinates are valid
        var slice = this.diagram; // no need to copy
        for (var i = 0; i < remainingDimensions; i++) {
            var input = this.sliceInputs[i];
            var position = Globular.parseSlice(input.val());
            _assert(position);
            if (controls  && controls.slices[i]) val = controls.slices[i];
            position.height = Math.min(position.height, Math.max(slice.data.length, 1));
            if (position.height < 0) position.height = 0;
            if (position.height == slice.data.length) position.regular = true;
            input.val(Globular.generateSlice(position));
            //input.val(Math.min(val, Math.max(slice.data.length, 1)));
            update_control_width(input);
            input.attr('max', Math.max(1, slice.data.length));
            slice = slice.getSlice(position); // no need to copy slice
        }
    }

    highlightSlice(index) {
        return null;
        // Get bounding box for entire action
        var location = this.getSlices();
        var box = this.diagram.getLocationBoundingBox(location.reverse());
        if (box == null) return; // no box to display

        // Get display data for bounding box
        var display_data = this.diagram.getLocationBoundaryBox(null, box, this.getSlices().reverse());
        if (display_data == null) return; // the box is invisible on the current slice

        this.highlightBox(display_data.box, display_data.boundary);
    }

    // Highlight a portion of the diagram
    highlightNextSlice() {
        // Don't highlight if we're on the last slice
        let sliceControl = this.sliceInputs.last();
        if (sliceControl.val() == sliceControl.attr('max')) return;

        // Get the bounding box of the cell which is next to act
        let slices = this.getSlices().slice(0, -1);
        let slice = this.diagram.getSlice(slices.reverse());
        let height = sliceControl.val();

        // If the value is out of range (e.g. if we're on the source slice of an identity diagram,
        // do nothing)
        if (height >= slice.data.length) return;
        let box = slice.data[height].box;

        // Apply the highlight
        this.highlightBox(box);
    }

    removeHighlight() {
        this.display.removeHighlight();
    }

    highlightAction(action, boundary) {
        return;
        
        // Decide what to actually highlight. If we're cancelling something on the boundary, highlight that instead.
        var real_boundary, real_action;
        if (action.preattachment == null) {
            real_boundary = boundary;
            real_action = action;
        } else {
            real_boundary = boundary;
            if (action.preattachment.boundary != null) {
                if (real_boundary == null) real_boundary = {
                    depth: 0
                };
                real_boundary.depth += action.preattachment.boundary.depth;
                real_boundary.type = action.preattachment.boundary.type;
            }
            real_action = action.preattachment;
        }

        // Get bounding box for entire action
        var slice = this.diagram;
        if (real_boundary != null) {
            for (var i = 0; i < real_boundary.depth - 1; i++) {
                slice = slice.getSourceBoundary();
            }
            if (real_boundary.type == 's') slice = slice.getSourceBoundary();
            else slice = slice.getTargetBoundary();
        }
        var boundary_box = slice.getBoundingBox(real_action);
        if (boundary_box == null) return;

        // Get display data for bounding box
        var display_data = this.diagram.getLocationBoundaryBox(real_boundary, boundary_box, this.getSlices().reverse());
        if (display_data == null) return;

        this.highlightBox(display_data.box, display_data.boundary);
    }

    // Highlight a portion of the diagram
    highlightBox(box, boundary) {
        // Remove an existing highlight
        this.removeHighlight();
        
        // Add the highlight to the diagram
        this.display.highlightBox(box, boundary);   
    }

    // Attach the given diagram to the window, showing at least the specified boundary
    setDiagram(data /*diagram, boundary, controls*/ ) {
        data = data || { diagram: null, preserve_view: false };

        this.diagram = data.diagram;

        if (data.diagram != null) {
            this.updateControls(data.drag, data.controls);
        } else {
            this.removeControls();
        }

        this.display.setDiagram(data.diagram, data.preserve_view);
    }

    render() {
        this.display.render();
    }

    getSlices() {
        if (this.sliceInputs === null) {
            return null;
        }

        return this.sliceInputs.map(input => (Globular.parseSlice(input.val())));
    }

    getSuppress() {
        if (this.suppressInput === null) {
            return null;
        }

        return Number(this.suppressInput.val());
    }

    getVisibleDiagram() {
        if (this.diagram === null) {
            return null;
        }

        return this.diagram.getSlice(this.getSlices()/*.reverse()*/);
    }

    getBoundaryFlags() {
        return this.sliceInputs.map(input => {
            let source = input.val() == 0 /*input.attr("min")*/;
            let target = input.val() == input.attr("max");
            return { source, target };
        });
    }

    getControls() {
        let project = this.getSuppress();
        let slices = this.getSlices();
        return { project, slices };
    }

    showPopup(text, style) {
        let popup = $('#diagram-popup');

        // Create popup if necessary
        if (popup.length == 0) {
            popup = $('<div>').attr('id', 'diagram-popup').appendTo('#diagram-canvas');
        }

        // Update content and style
        popup.html(text).css(style);
    }

    hidePopup() {
        $('#diagram-popup').remove();
    }

}


// Make the number scrollers the correct width
function update_control_width(input) {
    var length = String(input.val()).length;
    var width = 30 + 6 * length;
    $(input).css('max-width', width + 'px');
}

