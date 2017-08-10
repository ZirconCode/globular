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
function Display(container, diagram) {
    this['_t'] = 'Display';
    this.container = container;
    this.diagram = diagram;
    this.select_zone = null;
    this.suppress_input = null;
    this.view_input = null;
    this.custom_view = false;
    this.slices = [];
    var self = this;
    $(container).mousedown(function(event) {
        self.mousedown(event)
    });
    $(container).mouseup(function(event) {
        self.mouseup(event)
    });
    $(container).mousemove(function(event) {
        self.mousemove(event)
    });
    this.create_controls();
}

// Disable mouse interaction
Display.prototype.disableMouse = function() {
    this.container.css('pointer-events', 'none');
}

// Enable mouse interaction
Display.prototype.enableMouse = function() {
    this.container.css('pointer-events', 'all');
}

// Extract local and global pixel coordinates of an event
function eventToPixels(event) {
    return {
        global: {
            x: event.clientX,
            y: event.clientY
        },
        local: {
            x: event.originalEvent.layerX,
            y: event.originalEvent.layerY
        }
    };

}

Display.prototype.mousedown = function(event) {

    // Only interact with left mouse button
    if (event.buttons != 1) return;

    if (!gProject.initialized) return;
    if (this.diagram == null) return;

    // Check we're within the bounds    
    var b = $(this.container)[0].bounds;
    if (b == undefined) return;
    var pixels = eventToPixels(event);
    var logical = this.pixelsToGrid(pixels);
    if (logical == undefined) return;
    if (logical.x < b.left) return;
    if (logical.x > b.right) return;
    if (logical.y < b.bottom) return;
    if (logical.y > b.top) return;

    // Store the screen coordinates of the click (can't store by reference as object is not static)
    this.select_pixels = eventToPixels(event);
    console.log("Click at x=" + this.select_pixels.x + ", y=" + this.select_pixels.y);
}

var min_drag = 0.25;
Display.prototype.mousemove = function(event) {
    if (!gProject.initialized) return;
    if (this.diagram == null) return;

    var timer = new Timer("Display.mousemove - updating popup")


    //var pixels = {x: event.originalEvent.layerX, y: event.originalEvent.layerY};
    var pixels = eventToPixels(event);
    //console.log(JSON.stringify(pixels));
    //console.log('grid.x = ' + new_grid.x + ', grid.y = ' + new_grid.y);
    this.updatePopup({
        logical: this.pixelsToLogical(pixels),
        pixels: pixels
    });

    if (this.select_pixels == null) return;
    if (!detectLeftButton(event)) {
        this.select_pixels = null;
        return;
    }

    var dx = -(this.select_pixels.global.x - pixels.global.x);
    var dy = this.select_pixels.global.y - pixels.global.y;

    //console.log("distance = " + Math.sqrt(dx*dx+dy*dy));
    var threshold = 50;


    if (dx * dx + dy * dy < threshold * threshold) {
        //console.log("Haven't moved far enough");
        return;
    }


    var data = this.pixelsToLogical(this.select_pixels);
    this.select_pixels = null;

    // Clicking a 2d picture
    if (this.data.dimension == 2) {
        if (data.dimension == this.diagram.getDimension() - 1) {
            // Clicking on an edge
            if (Math.abs(dx) < 0.7 * threshold) return;
            data.directions = [dx > 0 ? +1 : -1];
        } else if (data.dimension == this.diagram.getDimension()) {
            // Clicking on a vertex
            if (Math.abs(dy) < 0.7 * threshold) return;
            data.directions = [dy > 0 ? +1 : -1, dx > 0 ? +1 : -1];
        }

        // Clicking a 1d picture
    } else if (this.data.dimension == 1) {
        data.directions = [dx > 0 ? +1 : -1];
    }

    gProject.dragCellUI(data);
};

Display.prototype.updatePopup = function(data) {
    var popup = $('#diagram-popup');
    if (this.update_in_progress || data.logical == null) {
        popup.remove();
        this.popup = null;
        return;
    }

    // Create popup if necessary
    if (popup.length == 0) {
        popup = $('<div>').attr('id', 'diagram-popup').appendTo('#diagram-canvas');
    }

    this.popup = data.logical;
    var boundary = this.diagram.getBoundary(data.logical.boundary);
    var cell = boundary.getCell(data.logical.coordinates.reverse());
    var boundary_string = (data.logical.boundary == null ? '' : data.logical.boundary.type.repeat(data.logical.boundary.depth) + ' ');
    var description = cell.id.getFriendlyName() + ' @ ' + boundary_string + JSON.stringify(data.logical.coordinates);
    var pos = $('#diagram-canvas').position();
    popup.html(description)
        .css({
            left: 5 + pos.left + data.pixels.local.x,
            top: data.pixels.local.y - 28,
            position: 'absolute'
        });
}

Display.prototype.pixelsToLogical = function(pixels) {
    if (pixels == null) return null;
    if (this.data == null) return null;
    if (this.data.dimension == 0) return this.pixelsToLogical_0(pixels);
    if (this.data.dimension == 1) return this.pixelsToLogical_1(pixels);
    if (this.data.dimension == 2) return this.pixelsToLogical_2(pixels);
}

Display.prototype.pixelsToLogical_0 = function(pixels) {
    var grid_coord = this.pixelsToGrid(pixels);
    var elt = document.elementFromPoint(pixels.global.x, pixels.global.y);
    var element_type = elt.getAttributeNS(null, 'element_type');
    var element_index = Number(elt.getAttributeNS(null, 'element_index'));

    if (element_type == 'vertex') {
        var vertex = this.data.vertex;
        var padded = this.padCoordinates([0]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags()
        });
        position.dimension = this.diagram.getDimension();
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }
}

Display.prototype.pixelsToLogical_1 = function(pixels) {

    var grid_coord = this.pixelsToGrid(pixels);
    var elt = document.elementFromPoint(pixels.global.x, pixels.global.y);
    var element_type = elt.getAttributeNS(null, 'element_type');
    var element_index = Number(elt.getAttributeNS(null, 'element_index'));

    if (element_type == 'vertex') {
        var vertex = this.data.vertices[element_index];
        var padded = this.padCoordinates([vertex.level]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags()
        });
        position.dimension = this.diagram.getDimension();
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }

    var b = $(this.container)[0].bounds;
    var allow_s = Math.abs(grid_coord.x - b.left) < 0.25;
    var allow_t = Math.abs(grid_coord.x - b.right) < 0.25;

    if (element_type == 'edge') {
        var edge = this.data.edges[element_index];
        var padded = this.padCoordinates([edge.level, 0]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags().concat([{
                source: allow_s,
                target: allow_t
            }])
        });
        position.dimension = this.diagram.getDimension() - 1;
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }

    return null;
}

Display.prototype.pixelsToLogical_2 = function(pixels) {

    var grid_coord = this.pixelsToGrid(pixels);

    // Get boundary distance
    var b = $(this.container)[0].bounds;
    var allow_s1 = Math.abs(grid_coord.y - b.bottom) < 0.25;
    var allow_t1 = Math.abs(grid_coord.y - b.top) < 0.25;
    var allow_s2 = Math.abs(grid_coord.x - b.left) < 0.25;
    var allow_t2 = Math.abs(grid_coord.x - b.right) < 0.25;

    //var dummies = $('.dummy');
    //dummies.css('display', 'none');
    var elt = document.elementFromPoint(pixels.global.x, pixels.global.y);
    //dummies.css('display', 'inline');
    var element_type = elt.getAttributeNS(null, 'element_type');
    var element_index = Number(elt.getAttributeNS(null, 'element_index'));
    var element_index_2 = Number(elt.getAttributeNS(null, 'element_index_2'));

    if (element_type == 'vertex') {
        var padded = this.padCoordinates([element_index]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags()
        });
        position.dimension = this.diagram.getDimension();
        position.shiftKey = pixels.shiftKey;
        position.origin = element_type;
        return position;
    }

    var height = Math.floor(grid_coord.y + 0.5 - b.bottom);
    //if (this.data.vertices.length == 0) height = 0;
    height = Math.min(height, this.data.vertices.length);

    if (element_type == 'edge') {
        // We know which edge, and we know the height
        var edge = this.data.edges[element_index];

        // Adjust height to correct for phenomenon that edges can 'protrude'
        // above and below their true vertical bounds.
        if (edge.finish_vertex != null) height = Math.min(height, edge.finish_vertex);
        if (edge.start_vertex != null) height = Math.max(height, edge.start_vertex + 1);

        // Correct when there are no vertices
        // ???

        var edges_at_height_index = this.data.edges_at_level[height].indexOf(element_index);
        var edges_to_left = edges_at_height_index + 1;
        var padded = this.padCoordinates([height, edges_to_left - 1]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags().concat([{
                source: allow_s1,
                target: allow_t1
            }])
        });
        position.dimension = this.diagram.getDimension() - 1;
        position.shiftKey = pixels.shiftKey;
        position.origin = element_type;
        return position;
    }

    if (element_type == 'interchanger_edge') {
        var vertex = this.data.vertices[element_index];
        var relevant_edges;
        var local_edge_index;
        var effective_height = Math.floor(grid_coord.y + 1 - b.bottom);
        if (grid_coord.y <= vertex.intersection.centre[1]) {
            relevant_edges = vertex.source_edges;
            local_edge_index = 1 - element_index_2;
            effective_height--;
        } else {
            relevant_edges = vertex.target_edges;
            local_edge_index = element_index_2;
        }
        if (vertex.type == 'Int') local_edge_index = 1 - local_edge_index;
        var edge_index = relevant_edges[local_edge_index];
        //var vertex_height_fraction = decimal_part(vertex.intersection.centre[1]);
        //var effective_height = Math.floor(vertex_height_fraction + (grid_coord.y - b.bottom));
        var edges_at_height_index = this.data.edges_at_level[effective_height].indexOf(edge_index);
        var edges_to_left = edges_at_height_index + 1;
        var padded = this.padCoordinates([effective_height, edges_to_left - 1]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags().concat([{
                source: allow_s1,
                target: allow_t1
            }])
        });
        if (position.coordinates.last() < 0) debugger;
        position.dimension = this.diagram.getDimension() - 1;
        position.shiftKey = pixels.shiftKey;
        position.origin = element_type;
        return position;
    }

    if (element_type == 'region') {
        /*
            There's insufficient data in the region SVG object to determine
            the logical position. So we should do something a bit clever,
            possibly involving using the equation for a cubic to see if we're
            to the left or right of a region.
            
            For now, what we have is good enough.
        */

        // Establish edges_to_left
        var edges_to_left;
        for (edges_to_left = 0; edges_to_left < this.data.edges_at_level[height].length; edges_to_left++) {
            var edge_index = this.data.edges_at_level[height][edges_to_left];
            if (this.data.edges[edge_index].x > grid_coord.x) break;
        }

        // The user has clicked on a region
        var depth = this.visible_diagram.getSlice([edges_to_left, height]).cells.length - 1; // no need to copy slice
        if (depth < 0) depth = 0;
        var entity_coords = this.visible_diagram.realizeCoordinate([depth, edges_to_left, height]).reverse();
        //entity_coords.reverse();
        //var padded = this.padCoordinates([height, edges_to_left, depth]);
        var padded = this.padCoordinates(entity_coords);
        //if (this.slices.length > 0 && this.slices[0].attr('max') == 0) padded[0] = 1; // fake being in the target
        //console.log("Click on region at coordinates " + JSON.stringify(padded));
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags().concat([{
                source: allow_s1,
                target: allow_t1
            }, {
                source: allow_s2,
                target: allow_t2
            }])
        });
        position.dimension = this.diagram.getDimension() - 2;
        position.shiftKey = grid_coord.shiftKey;
        position.origin = element_type;
        return position;

    }

    return null;
}

/*
Display.prototype.gridToLogical = function(grid) {
    if (grid == null) return null;
    if (this.data == null) return null;
    if (this.data.dimension == 0) return this.gridToLogical_0(grid);
    if (this.data.dimension == 1) return this.gridToLogical_1(grid);
    if (this.data.dimension == 2) return this.gridToLogical_2(grid);
}
*/

/*
Display.prototype.gridToLogical_0 = function(grid_coord) {
    var vertex = this.data.vertex;
    var dx = grid_coord.x - vertex.x;
    var dy = grid_coord.y - vertex.y;
    if (dx * dx + dy * dy > 0.1 * 0.1) return null;
    var padded = this.padCoordinates([0]);
    var position = this.diagram.getBoundaryCoordinates({
        coordinates: padded,
        allow_boundary: this.getBoundaryFlags()
    });
    position.dimension = this.diagram.getDimension();
    position.shiftKey = grid_coord.shiftKey;
    return position;
}
*/

/*
Display.prototype.gridToLogical_1 = function(grid_coord) {

    // Has the user clicked on a vertex?
    for (var i = 0; i < this.data.vertices.length; i++) {
        var vertex = this.data.vertices[i];
        var dx = grid_coord.x - vertex.x;
        var dy = grid_coord.y - vertex.y;
        if (dx * dx + dy * dy > 0.1 * 0.1) continue;

        // User has selected this vertex
        var padded = this.padCoordinates([vertex.level]);
        //if (this.slices.length > 0 && this.slices[0].attr('max') == 0) padded[0] = 1; // fake being in the target
        //console.log("Click on vertex at coordinates " + JSON.stringify(padded));
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags()
        });
        position.dimension = this.diagram.getDimension();
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }

    // Get boundary distance
    var b = $(this.container)[0].bounds;
    var allow_s = Math.abs(grid_coord.x - b.left) < 0.25;
    var allow_t = Math.abs(grid_coord.x - b.right) < 0.25;
    //var boundary_distance = Math.min(Math.abs(grid_coord.x - b.left), Math.abs(grid_coord.x - b.right));
    //var allow_boundary = Math.abs(boundary_distance) < 0.25;

    // Has the user clicked on an edge?
    for (var i = 0; i < this.data.edges.length; i++) {
        var edge = this.data.edges[i];
        if (edge.start_x > grid_coord.x) continue;
        if (edge.finish_x < grid_coord.x) continue;
        // How close is this edge?
        var d = grid_coord.y - edge.y;
        if (Math.abs(d) > 0.05) continue;

        // User has clicked on this edge
        var padded = this.padCoordinates([edge.level, 0]);
        //if (this.slices.length > 0 && this.slices[0].attr('max') == 0) padded[0] = 1; // fake being in the target
        //console.log("Click on edge at coordinates " + JSON.stringify(padded));
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags().concat([{
                source: allow_s,
                target: allow_t
            }])
        });
        position.dimension = this.diagram.getDimension() - 1;
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }

    // Clicked on nothing
    return null;

}

Display.prototype.gridToLogical_2 = function(grid_coord) {

    var height = grid_coord.y;

    // Make sure we're within the diagram bounds
    var b = $(this.container)[0].bounds;
    if (grid_coord.x < b.left) return null;
    if (grid_coord.x > b.right) return null;
    if (grid_coord.y < b.bottom) return null;
    if (grid_coord.y > b.top) return null;

    // Get boundary distance
    var allow_s1 = Math.abs(grid_coord.y - b.bottom) < 0.25;
    var allow_t1 = Math.abs(grid_coord.y - b.top) < 0.25;
    var allow_s2 = Math.abs(grid_coord.x - b.left) < 0.25;
    var allow_t2 = Math.abs(grid_coord.x - b.right) < 0.25;

    // Has the user clicked on a vertex?
    for (var i = 0; i < this.data.vertices.length; i++) {
        var vertex = this.data.vertices[i];
        var dx = grid_coord.x - vertex.x;
        var dy = grid_coord.y - vertex.y;
        if (dx * dx + dy * dy > 0.1 * 0.1) continue;

        // User has selected this vertex
        var padded = this.padCoordinates([vertex.level]);
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags()
        });
        position.dimension = this.diagram.getDimension();
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }

    // Find the closest edge
    var best_edge_index = -1;
    var best_edge_distance = Number.MAX_VALUE;
    var slice_height = -1;
    var edges_to_left = 0;
    for (var i = 0; i < this.data.edges.length; i++) {
        var edge = this.data.edges[i];
        if (edge.start_height > height) continue;
        if (edge.finish_height <= height) continue;
        // How close is this edge?
        var d = grid_coord.x - edge.x;
        // If the edge is to the right, ignore it
        if (d < -0.1) continue;
        edges_to_left++;
        if (d < best_edge_distance) {
            best_edge_distance = d;
            best_edge_index = i;
        }
    }

    // Has the user clicked on an edge?
    if (Math.abs(best_edge_distance) < 0.05) {
        var padded = this.padCoordinates([Math.floor(height + 0.5 - b.bottom), edges_to_left - 1]);
        //if (this.slices.length > 0 && this.slices[0].attr('max') == 0) padded[0] = 1; // fake being in the target
        //console.log("Click on edge at coordinates " + JSON.stringify(padded));
        var position = this.diagram.getBoundaryCoordinates({
            coordinates: padded,
            allow_boundary: this.getBoundaryFlags().concat([{
                source: allow_s1,
                target: allow_t1
            }])
        });
        position.dimension = this.diagram.getDimension() - 1;
        position.shiftKey = grid_coord.shiftKey;
        return position;
    }

    // The user has clicked on a region
    var depth = this.visible_diagram.getSlice([edges_to_left, Math.floor(height + 0.5 - b.bottom)]).cells.length - 1; // no need to copy slice
    if (depth < 0) depth = 0;
    var padded = this.padCoordinates([Math.floor(height + 0.5 - b.bottom), edges_to_left, depth]);
    //if (this.slices.length > 0 && this.slices[0].attr('max') == 0) padded[0] = 1; // fake being in the target
    //console.log("Click on region at coordinates " + JSON.stringify(padded));
    var position = this.diagram.getBoundaryCoordinates({
        coordinates: padded,
        allow_boundary: this.getBoundaryFlags().concat([{
            source: allow_s1,
            target: allow_t1
        }, {
            source: allow_s2,
            target: allow_t2
        }])
    });
    position.dimension = this.diagram.getDimension() - 2;
    position.shiftKey = grid_coord.shiftKey;
    return position;
}
*/

Display.prototype.mouseup = function(event) {
    if (this.select_pixels == null) return;
    var position = this.pixelsToLogical(this.select_pixels);
    if (position == null) {
        this.select_pixels = null;
        return;
    }
    position.directions = null;
    gProject.dragCellUI(position);
}

Display.prototype.getExportRegion = function() {
    var b = $(this.container)[0].bounds;
    if (b === undefined) return;
    var top_left = this.gridToPixels({
        x: b.left,
        y: b.top
    });
    var bottom_right = this.gridToPixels({
        x: b.right,
        y: b.bottom
    });
    return {
        sx: top_left.x,
        sy: top_left.y,
        sWidth: bottom_right.x - top_left.x,
        sHeight: bottom_right.y - top_left.y,
        logical_width: b.right - b.left,
        logical_height: b.top - b.bottom
    };
}

Display.prototype.gridToPixels = function(grid) {
    var pixel = {};
    var b = $(this.container)[0].bounds;
    if (b === undefined) return;
    var pan = this.panzoom.getPan();
    var sizes = this.panzoom.getSizes();
    pixel.x = grid.x * sizes.realZoom + pan.x;
    pixel.y = (b.bottom - grid.y) * sizes.realZoom + pan.y;
    //console.log("pixel.x:" + pixel.x + ", pixel.y:" + pixel.y);
    return pixel;
}

Display.prototype.pixelsToGrid = function(pixels) {
    var b = $(this.container)[0].bounds;
    if (b === undefined) return;
    var pan = this.panzoom.getPan();
    var sizes = this.panzoom.getSizes();
    var grid = {};
    grid.x = (pixels.local.x - pan.x) / sizes.realZoom;
    grid.y = (pan.y - pixels.local.y) / sizes.realZoom;
    grid.shiftKey = event.shiftKey;
    //console.log("grid.x:" + grid.x + ", grid.y:" + grid.y);
    //this.gridToPixels(grid);
    return grid;

    /*
    var this_width = $(this.container).width();
    var this_height = $(this.container).height();
    if (this_width == 0) return null;
    if (this_height == 0) return null;
    var b = $(this.container)[0].bounds;
    if (b === undefined) return;
    b.top_left = {};
    b.height = b.top - b.bottom;
    b.width = b.right - b.left;
    if (this_width / this_height < b.width / b.height) {
        // Picture is short and fat, touching the sides of the viewing area
        b.top_left.pix_x = 0;
        b.top_left.pix_y = (this_height - (b.height * this_width / b.width)) / 2;
        b.pix_width = this_width;
        b.pix_height = b.height * this_width / b.width;
    } else {
        // Picture is tall and thin, touching the top and bottom of the viewing area
        b.top_left.pix_x = (this_width - (b.width * this_height / b.height)) / 2;
        b.top_left.pix_y = 0;
        b.pix_width = b.width * this_height / b.height;
        b.pix_height = this_height;
    }
    var x = b.left + (event.offsetX - b.top_left.pix_x) * b.width / b.pix_width;
    var y = b.top - (event.offsetY - b.top_left.pix_y) * b.height / b.pix_height;
    return {
        x: x,
        y: y
    };
    */
}

Display.prototype.downloadSequence = function() {

    // If we're not ready, do nothing
    if (!this.has_controls()) return;

    // Get name for this sequence
    var prefix = prompt("Please enter a name for this sequence", "graphic");
    if (prefix == null) return;

    // If there are no slices, just export a PNG of the whole diagram
    if (this.slices.length == 0) {
        download_SVG_as_PNG(this.svg_element, this.getExportRegion(), filename + ".png");
        return;
    }

    // Start the chain of slice downloads
    this.downloadSlice(prefix, 0);

}

Display.prototype.downloadSlice = function(prefix, i) {
    
    // Move through all the slices and export them
    var slice = this.diagram;
    for (var j = 0; j < this.slices.length - 1; j++) {
        slice = slice.getSlice(this.slices[j].val());
    }

    // If we're being asked to render an invalid slice, give up
    if (i > slice.cells.length) return;
    var n = slice.cells.length.toString().length;

    this.slices[this.slices.length - 1].val(i);
    this.render();
    this.highlight_slice(this.slices.length - 1);
    var temp_this = this;
    download_SVG_as_PNG(this.svg_element, this.getExportRegion(), prefix + " " + i.toString().padToLength(n) + ".png", undefined,
        //(function(j){temp_this.downloadSlice(prefix, j + 1);})(i)
        (function(i){this.downloadSlice(prefix, i+1)}).bind(this, i)
    );
}

Display.prototype.has_controls = function() {
    return ($(this.container).children('div.control').length > 0);
}

// Make sure all the coordinates and suppressions make sense, bearing in mind
// that an attachment has just been performed at the specified location,
// so we want to keep it in view
Display.prototype.update_controls = function(drag, controls) {

    var timer = new Timer("Display.update_controls");

    // If there's no diagram, nothing to do
    if (this.diagram == null) return;

    // If there are no controls, create them
    if (!this.has_controls()) this.create_controls();

    // Update the suppression input
    var new_suppress = this.suppress_input.val();
    if (controls != null) new_suppress = controls.project;
    new_suppress = Math.min(new_suppress, this.diagram.getDimension());
    if (new_suppress < 0) new_suppress = 0;
    this.suppress_input.val(new_suppress);
    update_control_width(this.suppress_input);

    // Update the view dimension input
    if (this.view_input != null) {
        var new_view = Number(this.view_input.val());
        if (drag != undefined) {
            if (drag.boost) new_view++;
        }
        new_view = Math.min(2, new_view, this.diagram.getDimension() - new_suppress);
        this.view_input.val(new_view);
        update_control_width(new_view);
    }

    // Update the slice controls
    this.update_slice_container(drag, controls);

    //timer.Report();
}

Display.prototype.control_change = function() {
    var timer = new Timer('Display.control_change');
    gProject.clearThumbnails();
    this.update_controls();
    this.render();
    timer.Report();
}

// Create the control panel, only called in the constructor
Display.prototype.create_controls = function() {
    var c = $(this.container);

    // Remove any existing controls
    $(this.container).children('div.control').remove();

    // Choose popout mode if the display is small
    var popout = (c.width() < 100 || c.height() < 100);

    // Construct the main control div
    this.control = $('<div>')
        .attr('id', 'main_view_control')
        .addClass('control')
        .addClass(popout ? 'popout' : 'inline')
        .mousedown(function(e) {
            e.stopPropagation()
        })
        .mouseup(function(e) {
            e.stopPropagation()
        })
        .click(function(e) {
            e.stopPropagation()
        });
    this.container.append(this.control);

    /*
    // Construct the dimension control
    this.control.append(document.createTextNode('Viewer dimension '));
    this.view_input =
        $('<input>')
        .attr('type', 'number')
        .addClass('control')
        .attr('min', 0)
        .attr('id', 'view_input')
        .val(this.diagram == null ? 0 : Math.min(2, this.diagram.getDimension()))
        .mouseover(function() {
            this.focus();
        });
    this.view_input.on('input', function(event) {
        self.control_change(event)
    });
    this.control.append(this.view_input);
    this.control.append(document.createElement('br'));
    */

    // Construct the project control
    this.control.append(document.createTextNode('Project '));
    this.suppress_input =
        $('<input>')
        .attr('type', 'number')
        .addClass('control')
        .attr('min', 0)
        .val(this.diagram == null ? 0 : Math.max(0, this.diagram.getDimension() - 2))
        .mouseover(function() {
            this.focus();
        });
    var self = this;
    this.suppress_input.on('input', function(event) {
        $('#view_input').val(10);
        self.control_change(event)
    });
    this.control.append(this.suppress_input);
    update_control_width(this.suppress_input);


    // Construct the container for the slice controls
    this.slice_div = $('<div>').addClass('slice_container');
    this.slice_div.append(document.createTextNode('Slice '));
    this.control.append(this.slice_div);
    this.slices = [];
}

Display.prototype.update_slice_container = function(drag, controls) {

    // If the diagram is null, we shouldn't have any slice controls
    if (this.diagram == null) {
        for (var i = 0; i < this.slices.length; i++) {
            this.slices[i].remove();
        }
        this.slices = [];
        return;
    }

    // Calculate the desired number of slice controls
    var remaining_dimensions = this.diagram.getDimension() - $(this.suppress_input).val() - 2 /*this.view_input.val()*/ ;
    if (remaining_dimensions < 0) remaining_dimensions = 0;

    // Remove any superfluous slice controls
    while (this.slices.length > remaining_dimensions) {
        this.slices.last().remove();
        this.slices.pop();
    }

    // Add any additional slice controls with a dimension of zero
    var self = this;
    for (var i = this.slices.length; i < remaining_dimensions; i++) {
        this.slices[i] =
            $('<input>')
            .addClass('control')
            .addClass('slice')
            .attr('type', 'number')
            .attr('min', 0)
            .val(0)
            .on('input', function(event) {
                //.change(function(event) {
                self.control_change(event)
            })
            .hover(
                // Mouse over
                function() {
                    var timer = new Timer('mouse over slicer')
                    this.focus();
                    self.highlight_slice(Number(this.getAttribute('index')));
                    timer.Report();
                    /*
                    if (Number(this.getAttribute('index')) == self.slices.length - 1) {
                        self.highlight_next_slice();
                    }
                    */
                },
                // Mouse out
                function() {
                    var timer = new Timer('mouse out of slicer');
                    self.remove_highlight();
                    timer.Report();
                });

        // Store the index of the slice control
        (function(i) {
            self.slices[i].attr('index', i)
        })(i);
        this.slice_div.append(this.slices[i]);
        update_control_width(this.slices[i]);
    }

    // If a particular boundary has been requested, make sure it is within view
    if (drag != null) {
        if (drag.boundary == null) {
            // Rewrite in the interior, so advance the last slider
            if (this.slices.length > 0) {
                var counter = this.slices.last();
                var current = Number(counter.val());
                counter.val(current + 1);
                update_control_width(counter);
            }
        } else {
            if (drag.boundary.depth > 0) {
                var slice_index = drag.boundary.depth - 1;
                if (drag.boundary.type == 't') {
                    if (slice_index < this.slices.length) {
                        var current = Number(this.slices[slice_index].val());
                        this.slices[slice_index].val(current + 1);
                        update_control_width(this.slices[slice_index]);
                    }
                }
            }
        }
    }

    // Ensure the slice coordinates are valid
    var slice = this.diagram; // no need to copy
    for (var i = 0; i < remaining_dimensions; i++) {
        var input = this.slices[i];
        var val = input.val();
        if (controls != null) {
            if (controls.slices[i] != null) {
                val = controls.slices[i];
            }
        }
        input.val(Math.min(val, Math.max(slice.cells.length, 1)));
        update_control_width(input);
        input.attr('max', Math.max(1, slice.cells.length));
        slice = slice.getSlice(input.val()); // no need to copy slice
    }

}

// Make the number scrollers the correct width
function update_control_width(input) {
    var length = String(input.val()).length;
    var width = 24 + 6 * length;
    $(input).css('max-width', width + 'px');
}

Display.prototype.highlight_slice = function(index) {

    // Get bounding box for entire action
    var location = [];
    for (var i = 0; i <= index; i++) {
        location.unshift(Number(this.slices[i].val()));
    }
    var box = this.diagram.getLocationBoundingBox(location);
    if (box == null) return; // no box to display

    // Get display data for bounding box
    var display_data = this.diagram.getLocationBoundaryBox(null, box, this.padCoordinates([]).reverse());
    if (display_data == null) return; // the box is invisible on the current slice

    this.highlight_box(display_data.box, display_data.boundary);

}

// Highlight a portion of the diagram
Display.prototype.highlight_next_slice = function() {

    // Don't highlight if we're on the last slice
    var slice_control = this.slices.last();
    if (slice_control.val() == slice_control.attr('max')) return;

    // Get the bounding box of the cell which is next to act
    var slice = this.diagram;
    for (var i = 0; i < this.slices.length - 1; i++) {
        slice = slice.getSlice(this.slices[i].val()); // no need to copy slice
    }
    var height = slice_control.val();

    // If the value is out of range (e.g. if we're on the source slice of an identity diagram,
    // do nothing)
    if (height >= slice.cells.length) return;

    var box = slice.cells[height].box;

    // Apply the highlight
    this.highlight_box(box);
}

Display.prototype.remove_highlight = function() {
    $(this.container).children('svg').children('g').children('g').children('g').remove();
}

Display.prototype.highlight_action = function(action, boundary) {

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
    var display_data = this.diagram.getLocationBoundaryBox(real_boundary, boundary_box, this.padCoordinates([]).reverse());
    if (display_data == null) return;

    this.highlight_box(display_data.box, display_data.boundary);
}

// Highlight a portion of the diagram
Display.prototype.highlight_box = function(box, boundary) {

    // Remove an existing highlight
    this.remove_highlight();
    //$(this.container).children('svg').children('g').children('g').remove();

    // Add the highlight to the diagram
    globular_add_highlight(this.container, this.data, box, boundary, this.visible_diagram);
}

// Attach the given diagram to the window, showing at least the specified boundary
Display.prototype.set_diagram = function(data /*diagram, boundary, controls*/ ) {
    console.log("Set new diagram");
    if (data.diagram == null) {
        this.diagram = null;
        this.data = null;
        this.container.empty();
    } else {
        //this.diagram = diagram.copy();
        this.diagram = data.diagram;
        this.update_controls(data.drag, data.controls);
        this.render(data.preserve_view);
    }
}

Display.prototype.get_current_slice = function() {
    var position = [];
    for (var i = 0; i < this.slices.length; i++) {
        position.push(Number(this.slices[i].val()));
    }
    return position;
}

Display.prototype.render = function(preserve_view) {
    if (!this.custom_view) preserve_view = false;
    var timer = new Timer("Display.render");
    var slice = this.diagram;
    for (var i = 0; i < this.slices.length; i++) {
        slice = slice.getSlice(this.slices[i].val()); // no need to copy slice
    }
    this.visible_diagram = slice;
    var pan = null;
    var zoom = null;
    if (this.panzoom != null) {
        if (preserve_view) {
            pan = this.panzoom.getPan();
            zoom = this.panzoom.getZoom();
        }
        this.panzoom.destroy();
    }
    var data = globular_render(this.container, slice, this.highlight, this.suppress_input.val());
    this.svg_element = this.container.find('svg')[0];
    this.container.on('contextmenu', function(evt) {
        evt.preventDefault();
    })
    this.data = data;
    timer.Report();
    var display_object = this;
    this.panzoom = svgPanZoom(this.container.find('svg')[0], {
        onZoom: function() {
            display_object.custom_view = true
        },
        onPan: function() {
            display_object.custom_view = true
        }
    });
    if (pan != null) {
        this.panzoom.zoom(zoom);
        this.panzoom.pan(pan);
    }

    // Render highlight if necessary
    if (this.slices.length > 0) {
        if (this.slices.last().is(":focus")) {
            this.highlight_next_slice();
        }
    }

    //if (data == null) return;
}

// Pads an object with 'boundary_depth' and 'logical' properties
Display.prototype.padLocation = function(location) {
    if (location.boundary_depth > 0) {
        location.boundary_depth += coordinates.length;
    }
    var pad_coordinates = [];
    for (var i = 0; i < this.slices.length; i++) {
        pad_coordinates[i] = Number(this.slices[i].val());
    }
    location.logical = pad_coordinates.concat(location.logical);
}

// Pads a coordinate array with the slider coordinates
Display.prototype.padCoordinates = function(position) {
    var pad_position = [];
    for (var i = 0; i < this.slices.length; i++) {
        pad_position[i] = Number(this.slices[i].val());
    }
    position = pad_position.concat(position);
    return position;
}

Display.prototype.getBoundaryFlags = function() {
    var flags = [];
    for (var i = 0; i < this.slices.length; i++) {
        var flag = {};
        var s = this.slices[i];
        flag.source = (s.val() == s.attr('min'));
        flag.target = (s.val() == s.attr('max'));
        flags.push(flag);
    }
    return flags;
}

Display.prototype.getControls = function() {
    return {
        project: this.suppress_input == null ? null : Number(this.suppress_input.val()),
        slices: this.slices == null ? null : this.padCoordinates([])
    }
}

Display.prototype.setControls = function(controls) {
    if (controls == null) return;
    if (this.suppress_input != null && controls.project != null) {
        this.suppress_input.val(controls.project);
    }
    if (this.slices != null && controls.slices != null) {
        for (var i = 0; i < controls.slices.length; i++) {
            if (this.slices[i] != undefined) {
                this.slices[i].val(controls.slices(i));
            }
        }
    }
}