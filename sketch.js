// sketch.js
let img, origImg; // origImg is the p5.Image object representing the current state
let linePos = null; // Stores the x or y coordinate (in origImg's local space) of the selected line
let dragging = false; // True if a stretch operation is in progress
let panning = false; // True if panning (SHIFT + drag)
let axis = 'horizontal'; // 'horizontal' or 'vertical' stretch
let zoomLevel = 1; // Visual zoom level of the canvas
let originalFilename = ''; // Filename of the loaded image
let exportWidth = 1080; // Canvas and export width
let exportHeight = 1080; // Canvas and export height

// imgX, imgY are the top-left coordinates for drawing origImg onto the main canvas.
// After the first stretch, origImg becomes full-canvas, and imgX/imgY become 0.
let imgX = 0;
let imgY = 0;
let panStartMouseX, panStartMouseY, panStartImgX, panStartImgY; // For panning logic

let uiDiv;
let fileInput, fileLabel, sizeSelect;
let zoomSlider, zoomValueSpan;
let orientRadio;
// Buttons are declared and created in setup

let canvasEl; // Reference to the canvas DOM element (p5.Renderer.elt)

// History stacks for undo/redo
// Each history entry will be a p5.Image object (a copy of origImg's state)
const history = [];
const redoStack = [];
const MAX_HISTORY_SIZE = 30;


function setup() {
  // Title
  createElement('h2', 'PixelStretch by RRON')
    .style('margin', '0')
    .style('padding', '4px 0')
    .style('font-family', 'sans-serif')
    .style('font-size', '18px')
    .style('color', '#333')
    .position(10, 10);

  // UI container
  uiDiv = createDiv().style('display', 'flex')
    .style('flex-wrap', 'wrap') // Allow wrapping for smaller screens
    .style('align-items', 'center')
    .style('gap', '8px')
    .style('background', '#f9f9f9')
    .style('padding', '6px 10px')
    .style('border', '1px solid #ddd')
    .style('border-radius', '6px')
    .style('font-size', '13px')
    .position(10, 40);

  // File input
  fileInput = createFileInput(handleFile).parent(uiDiv)
    .attribute('accept', 'image/*')
    .style('padding', '4px').style('font-size', '13px')
    .style('border', '1px solid #ccc').style('border-radius', '4px');

  fileLabel = createSpan('No file').parent(uiDiv)
    .style('font-style', 'italic').style('color', '#555')
    .style('font-size', '13px');

  // Export size selector
  createSpan('Size:').parent(uiDiv)
    .style('margin-left', '12px').style('color', '#333')
    .style('font-size', '13px');
  sizeSelect = createSelect().parent(uiDiv)
    .style('font-size', '13px');
  ['1080×1080', '1920×1080', '1080×1920', '1200x628', '1000x1500'].forEach(o => sizeSelect.option(o));
  sizeSelect.selected('1080×1080');
  sizeSelect.changed(onSizeChange);

  // Zoom control
  createSpan('Zoom:').parent(uiDiv)
    .style('margin-left', '12px').style('color', '#333')
    .style('font-size', '13px');
  zoomSlider = createSlider(0.1, 3, 1, 0.01).parent(uiDiv) // Max zoom 3x
    .style('width', '100px');
  zoomValueSpan = createSpan('100%').parent(uiDiv)
    .style('min-width', '36px').style('text-align', 'right')
    .style('color', '#333').style('font-size', '13px');
  zoomSlider.input(() => {
    zoomLevel = zoomSlider.value();
    zoomValueSpan.html(`${Math.round(zoomLevel * 100)}%`);
    if (canvasEl) {
      canvasEl.style.transform = `scale(${zoomLevel})`;
    }
  });

  // Orientation selector
  createSpan('Axis:').parent(uiDiv)
    .style('margin-left', '12px').style('font-size', '13px')
    .style('color', '#333');
  orientRadio = createRadio().parent(uiDiv);
  orientRadio.option('horizontal', 'Hor');
  orientRadio.option('vertical', 'Ver');
  orientRadio.selected('horizontal');
  orientRadio.changed(() => axis = orientRadio.value());
  // Apply some basic styling to radio options for better layout
  orientRadio.style('display', 'inline-flex').style('gap', '5px');


  // Center button
  let centerBtn = createButton('⌖').parent(uiDiv)
    .attribute('title', 'Center Image')
    .style('padding', '4px 8px')
    .style('border', 'none')
    .style('border-radius', '4px')
    .style('background', '#17a2b8')
    .style('color', '#fff')
    .style('font-size', '14px')
    .style('cursor', 'pointer');
  centerBtn.mousePressed(centerImage);

  // Action buttons
  const btns = [
    { name: '⟳', fn: resetImage, color: '#6c757d', title: 'Reset' },
    { name: '↶', fn: undoImage, color: '#6c757d', title: 'Undo' },
    { name: '↷', fn: redoImage, color: '#6c757d', title: 'Redo' },
    { name: '💾', fn: saveImage, color: '#dc3545', title: 'Save' }
  ];
  btns.forEach(o => {
    const b = createButton(o.name).parent(uiDiv)
      .attribute('title', o.title)
      .style('padding', '4px 8px')
      .style('border', 'none')
      .style('border-radius', '4px')
      .style('background', o.color)
      .style('color', '#fff')
      .style('font-size', '14px')
      .style('cursor', 'pointer');
    b.mousePressed(o.fn);
  });

  // Canvas
  let mainP5Canvas = createCanvas(exportWidth, exportHeight);
  canvasEl = mainP5Canvas.elt; // Get the DOM element
  mainP5Canvas.position(10, uiDiv.position().y + uiDiv.height + 15); // Position below UI
  mainP5Canvas.style('background', '#efefef')
    .style('border', '1px solid #ccc')
    .style('transform-origin', '0 0'); // Important for zooming
  
  pixelDensity(1); // Main canvas uses 1:1 pixel mapping

  redrawCanvas();
}

function onSizeChange() {
  const [w, h] = sizeSelect.value().split('×').map(n => int(n));
  exportWidth = w; exportHeight = h;
  resizeCanvas(w, h);
  
  // Reposition canvas if UI height changed (e.g. due to wrapping)
  if (uiDiv && canvasEl) {
    select('canvas').position(10, uiDiv.position().y + uiDiv.height + 15);
  }

  centerImage(); // Re-center current image or adjust if it was full canvas
  redrawCanvas();
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image')) {
    fileLabel.html('Invalid file type');
    return;
  }
  originalFilename = file.name;
  fileLabel.html(truncateName(originalFilename));
  if (fileInput.elt) fileInput.elt.value = '';

  loadImage(file.data, loadedImage => {
    // Create a new p5.Image for origImg from the loaded one
    origImg = createImage(loadedImage.width, loadedImage.height);
    origImg.copy(loadedImage, 0, 0, loadedImage.width, loadedImage.height, 0, 0, loadedImage.width, loadedImage.height);

    const scaleFactor = min(exportWidth / origImg.width, exportHeight / origImg.height, 1);
    origImg.resize(floor(origImg.width * scaleFactor), floor(origImg.height * scaleFactor));

    history.length = 0;
    redoStack.length = 0;
    history.push(origImg.get()); // Save a copy of the initial state

    centerImage();
    redrawCanvas();
  }, () => {
    fileLabel.html('Error loading image');
  });
}

function centerImage() {
  if (!origImg) return;
  imgX = (exportWidth - origImg.width) / 2;
  imgY = (exportHeight - origImg.height) / 2;
}

function truncateName(name) {
  if (name.length <= 25) return name;
  const extMatch = name.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const base = name.substring(0, name.length - ext.length);
  return base.substring(0, 10) + '…' + base.slice(-6) + ext;
}

function saveImage() {
  if (!origImg) return;
  const base = originalFilename ? originalFilename.replace(/\.[^.]+$/, '') : 'pixelstretch_image';
  
  let pg = createGraphics(exportWidth, exportHeight);
  pg.pixelDensity(1);
  pg.image(origImg, imgX, imgY); // Draw origImg at its current position
  
  save(pg, `${base}_${exportWidth}x${exportHeight}.png`);
  pg.remove();
}

function resetImage() {
  if (history.length === 0) return;
  origImg = history[0].get(); // Get a copy of the initial state
  history.length = 1;
  redoStack.length = 0;
  centerImage();
  redrawCanvas();
}

function undoImage() {
  if (history.length < 2) return;
  redoStack.push(history.pop().get()); // Move current state (copy) to redo
  origImg = history[history.length - 1].get(); // Get copy of previous state
  centerImage();
  redrawCanvas();
}

function redoImage() {
  if (redoStack.length === 0) return;
  const nextState = redoStack.pop(); // This is already a p5.Image copy
  history.push(nextState.get()); // Push a copy to history
  origImg = nextState; // Restore state
  centerImage();
  redrawCanvas();
}

function mousePressed() {
  // mouseX and mouseY are relative to the p5 canvas origin.
  // Check if click is within the visual bounds of the p5 canvas element.
  if (mouseX < 0 || mouseX > exportWidth || mouseY < 0 || mouseY > exportHeight) {
    return; 
  }

  if (keyIsDown(SHIFT) && origImg) {
    panning = true;
    // mouseX, mouseY are already in the scaled coordinate system of the canvas content
    // due to p5.js handling of CSS transforms.
    panStartMouseX = mouseX; 
    panStartMouseY = mouseY;
    panStartImgX = imgX;
    panStartImgY = imgY;
    return;
  }

  if (!origImg) return;

  // Convert mouse coords from scaled-view space to 100%-scale content space
  const contentMouseX = mouseX / zoomLevel;
  const contentMouseY = mouseY / zoomLevel;

  // Position relative to origImg's top-left corner (in origImg's local coordinates)
  const rx = contentMouseX - imgX;
  const ry = contentMouseY - imgY;

  if (rx < 0 || ry < 0 || rx >= origImg.width || ry >= origImg.height) {
    return; // Click is outside the image bounds
  }

  dragging = true;
  linePos = axis === 'horizontal' ? round(ry) : round(rx);
  // Constrain linePos to be within the image dimensions
  if (axis === 'horizontal') {
    linePos = constrain(linePos, 0, origImg.height - 1);
  } else {
    linePos = constrain(linePos, 0, origImg.width - 1);
  }
}

function mouseDragged() {
  if (panning) {
    // Calculate delta in scaled mouse coordinates
    const dx_scaled = mouseX - panStartMouseX;
    const dy_scaled = mouseY - panStartMouseY;
    // Convert delta to 100% scale for imgX/Y update
    imgX = panStartImgX + dx_scaled / zoomLevel;
    imgY = panStartImgY + dy_scaled / zoomLevel;
    redrawCanvas();
    return;
  }

  if (!dragging || !origImg) return;

  redrawCanvas(); // Clear and draw base image

  const contentMouseX = mouseX / zoomLevel;
  const contentMouseY = mouseY / zoomLevel;
  const rx = contentMouseX - imgX; // current X in origImg local space
  const ry = contentMouseY - imgY; // current Y in origImg local space
  
  const currentPosInOrigImg = axis === 'horizontal' ? round(ry) : round(rx);

  if (axis === 'horizontal') {
    previewStretchHorizontal(linePos, currentPosInOrigImg);
  } else {
    previewStretchVertical(linePos, currentPosInOrigImg);
  }
}

function previewStretchHorizontal(y0_local, y1_local) {
  if (!origImg || origImg.width === 0 || origImg.height === 0) return;
  const clampedY0 = constrain(y0_local, 0, origImg.height - 1);
  
  const rowImg = origImg.get(0, clampedY0, origImg.width, 1);
  if (!rowImg || rowImg.width === 0) return;

  const startLocalY = min(y0_local, y1_local);
  const endLocalY = max(y0_local, y1_local);

  for (let currentLocalY = startLocalY; currentLocalY <= endLocalY; currentLocalY++) {
    let canvasY = imgY + currentLocalY; // Position on the (unzoomed) canvas grid
    // Draw stretched row using origImg's current width and X offset.
    // Clipping to canvas bounds for preview efficiency.
    if (canvasY >= 0 && canvasY < exportHeight) {
         image(rowImg, imgX, canvasY, origImg.width, 1); // MODIFIED
    }
  }
}

function previewStretchVertical(x0_local, x1_local) {
  if (!origImg || origImg.width === 0 || origImg.height === 0) return;
  const clampedX0 = constrain(x0_local, 0, origImg.width - 1);

  const colImg = origImg.get(clampedX0, 0, 1, origImg.height);
  if (!colImg || colImg.height === 0) return;

  const startLocalX = min(x0_local, x1_local);
  const endLocalX = max(x0_local, x1_local);

  for (let currentLocalX = startLocalX; currentLocalX <= endLocalX; currentLocalX++) {
    let canvasX = imgX + currentLocalX; // Position on the (unzoomed) canvas grid
    // Draw stretched column using origImg's current height and Y offset.
    if (canvasX >= 0 && canvasX < exportWidth) {
        image(colImg, canvasX, imgY, 1, origImg.height); // MODIFIED
    }
  }
}

function mouseReleased() {
  if (panning) {
    panning = false;
    return;
  }
  if (!dragging || !origImg) {
    dragging = false;
    return;
  }
  dragging = false;

  const contentMouseX = mouseX / zoomLevel;
  const contentMouseY = mouseY / zoomLevel;
  const finalLocalX = round(contentMouseX - imgX);
  const finalLocalY = round(contentMouseY - imgY);

  let pg = createGraphics(exportWidth, exportHeight);
  pg.pixelDensity(1);
  pg.image(origImg, imgX, imgY); // Draw current state as base

  if (axis === 'horizontal') {
    if (origImg.height === 0 || origImg.width === 0) { pg.remove(); return; } // Guard
    const y_source_line = constrain(linePos, 0, origImg.height - 1);
    const pixelRow = origImg.get(0, y_source_line, origImg.width, 1); // Sampled row has origImg.width
    if (!pixelRow || pixelRow.width === 0) { pg.remove(); return; }

    const startStretchLocalY = min(linePos, finalLocalY);
    const endStretchLocalY = max(linePos, finalLocalY);

    for (let currentLocalY = startStretchLocalY; currentLocalY <= endStretchLocalY; currentLocalY++) {
      let targetPgY = imgY + currentLocalY; // Y position on the pg canvas
      if (targetPgY >= 0 && targetPgY < exportHeight) {
         // Draw the pixelRow at its original width (origImg.width) and at current imgX offset
         pg.image(pixelRow, imgX, targetPgY, origImg.width, 1); // MODIFIED
      }
    }
  } else { // axis === 'vertical'
    if (origImg.width === 0 || origImg.height === 0) { pg.remove(); return; } // Guard
    const x_source_line = constrain(linePos, 0, origImg.width - 1);
    const pixelCol = origImg.get(x_source_line, 0, 1, origImg.height); // Sampled col has origImg.height
    if (!pixelCol || pixelCol.height === 0) { pg.remove(); return; }

    const startStretchLocalX = min(linePos, finalLocalX);
    const endStretchLocalX = max(linePos, finalLocalX);

    for (let currentLocalX = startStretchLocalX; currentLocalX <= endStretchLocalX; currentLocalX++) {
      let targetPgX = imgX + currentLocalX; // X position on the pg canvas
      if (targetPgX >= 0 && targetPgX < exportWidth) {
        // Draw the pixelCol at its original height (origImg.height) and at current imgY offset
        pg.image(pixelCol, targetPgX, imgY, 1, origImg.height); // MODIFIED
      }
    }
  }

  let newP5Image = createImage(exportWidth, exportHeight);
  newP5Image.copy(pg, 0, 0, exportWidth, exportHeight, 0, 0, exportWidth, exportHeight);
  origImg = newP5Image;
  pg.remove();

  imgX = 0; // After stretch, origImg is full canvas, positioned at 0,0
  imgY = 0;

  if (history.length >= MAX_HISTORY_SIZE) {
      history.shift(); // Limit history size
  }
  history.push(origImg.get()); // Push a copy
  redoStack.length = 0;

  redrawCanvas();
}

function redrawCanvas() {
  background(239); // Clears and fills canvas
  if (origImg) {
    // Draw origImg at its current imgX, imgY.
    // The CSS transform on canvasEl handles visual scaling (zoom).
    image(origImg, imgX, imgY);
  }
}

// function draw() {} // Not needed for event-driven updates
