// Constants
// const USE_P5_SOUND = true; // Use the p5 sound package (having issues with turning into noise)
const USE_P5_SOUND = false; // Use the built in js Audio

// Scales along the circle of fifths

const noteNames = ["C2", "Db2", "D2", "Eb2", "E2", "F2", "Gb2", "G2", "Ab2", "A2", "Bb2", "B2", "C3", "Db3", "D3", "Eb3", "E3", "F3", "Gb3", "G3", "Ab3", "A3", "Bb3", "B3", "C4", "Db4", "D4", "Eb4", "E4", "F4", "Gb4", "G4", "Ab4", "A4", "Bb4", "B4", "C5", "Db5", "D5", "Eb5", "E5", "F5", "Gb5", "G5", "Ab5", "A5", "Bb5", "B5", "C6", "Db6", "D6", "Eb6", "E6", "F6", "Gb6", "G6", "Ab6", "A6", "Bb6", "B6", "C7", "Db7", "D7", "Eb7", "E7", "F7", "Gb7", "G7", "Ab7", "A7", "Bb7", "B7"];

// Offset in half-steps from C for the circle of fifths
const circleOfFifthsBaseNumbers = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

// Amount of halfsteps (12 is an octave)
const rowOffsets = [36,36,24,24,12,12,0,0];

const scaleTypes = [[0,2,4,5,7,9,11,12], // Major
[0,2,4,7,9,12,14,16], // Pentatonic Jeremy
[0,3,5,6,7,10,12,15] // Blues
] 

const notes_folder = '../assets/sounds/piano_notes/';

const scaleNames = ["C","G","D","A","E","B","F#","Db","Ab","Eb","Bb","F"];
const minInterval = 50; // in milliseconds
const maxInterval = 1000; // in milliseconds
const intervalScaleFactor = 1.2; // Amount by which to scale the interval when adjusting the speed
const powerOffTime = 1000; // in milliseconds
const aliveColor = 9;
const playColor = 22;
const pauseColor = 5;
const offColor = 0;
const waitingColor = 12;
const [pauseRow, pauseCol] = [6, 8]; // Coords for the pause/play button
const [clearRow, clearCol] = [7, 8]; // Coords for the clear screen button
const [speedUpRow, speedUpCol] = [-1, 0]; // Coords for the speed up button
const [speedDownRow, speedDownCol] = [-1, 1]; // Coords for the speed down button
const [scaleLeftRow, scaleLeftCol] = [-1, 2]; // Coords for the scale left button
const [scaleRightRow, scaleRightCol] = [-1, 3]; // Coords for the scale right button
const novationLogoColour = 37;
const buttonOnColour = 21;

// Variables
let interval = 250; // Amount to wait between updates in milliseconds
let last_tempo_change = 0; // Reference point to use to ensure a steady rhythm, update on tempo change
let scaleNum = 0; // Where on the circle of fifths we are 0 is C, 1 is G, etc.. up to 11 is F and wrap around
let scaleType = 1; // Which of the scale types to use

let notes = [];
function preload() {
    for(let noteNum = 0; noteNum < noteNames.length; noteNum++){
        if(USE_P5_SOUND){
            notes[noteNum] = loadSound(concat(concat(notes_folder, noteNames[noteNum]), '.wav')); // Note that the compiled html lives in docs/projects
        }else{
            notes[noteNum] = new Audio(concat(concat(notes_folder, noteNames[noteNum]), '.wav'));
        }
    }
}

function mousePressed() {
userStartAudio();
}

function setup() {
outputVolume(0.1);
// scales[0][0].play();
}

// Board state
let boardState = [];
let numRows = 8;
let numCols = 8;
for (let i = 0; i < numCols; i++) {
boardState[i] = [];
for (let j = 0; j < numRows; j++) {
    boardState[i][j] = 0;
}
}

let gridNotes = []; // 2D array to hold the sounds assocatied with each of the 64 buttons
// This will enable us to stop and start them independently
for(let i = 0; i < numCols; i++){
gridNotes[i] = [];
}

// Function to create the grid of buttons
function createGrid() {
const grid = document.getElementById('grid');
grid.innerHTML = ''; // Clear existing grid

for (let row = 0; row < numRows + 1; row++) {
    for (let col = 0; col < numCols + 1; col++) {
    const button = document.createElement('button');
    if(row == 0 || col == numCols){
        button.classList.add('boundary');
    }else{
        button.classList.add('cell');
    }
    // Convert to the row and column as represented on the novation
    let novationRow = row - 1;
    let novationCol = col;
    button.dataset.row = novationRow;
    button.dataset.col = novationCol;
    button.addEventListener('click', () => onClick(novationRow, novationCol, mouseClick=true));
    grid.appendChild(button);
    }
}
// renderGrid();
}

// Run state
let updating = false;
// Check for MIDI support in the bnumRowser
if (navigator.requestMIDIAccess) {
navigator.requestMIDIAccess( { sysex: true } ).then(onMIDISuccess, onMIDIFailure);
} else {
console.error('Web MIDI API not supported in this bnumRowser.');
}

function onMIDISuccess(midiAccess) {
console.log('MIDI Access Object:', midiAccess);
midiAccess.inputs.forEach(input => {
    input.onmidimessage = getMIDIMessage;
});
}

function onMIDIFailure() {
console.error('Failed to get MIDI access - No MIDI devices.');
}
// Return the note associated with that button (given the current scaleNum and type)
function getNote(row, col){
let noteNum = 0;
noteNum += circleOfFifthsBaseNumbers[scaleNum]; // Offset to put us in the correct key
noteNum += scaleTypes[scaleType][col]; // Get the note from the column in the correct scale
noteNum += rowOffsets[row];
if(noteNum >= notes.length){
    noteNum -= notes.length;
}
// console.log(`Row: ${row}, Column: ${col}, Note: ${noteNames[noteNum]}`)
return notes[noteNum];
}
function onClick(row, col, mouseClick=false){
// Main buttons
if(row >= 0 && row < 8 && col < 8){
    // Swap the board state when pressed
    if(boardState[row][col] == 0){
    boardState[row][col] = 1;
    lightUp(row, col, aliveColor); // Give instant feedback
    // gridNotes[row][col] = getNote(row, col).cloneNode(true);
    gridNotes[row][col] = getNote(row, col);
    gridNotes[row][col].play();
    }else{
    boardState[row][col] = 0;
    lightUp(row, col, 0); // Give instant feedback
    }
}
// Play/pause button
if(row == pauseRow && col == pauseCol){
    if(updating){
    updating = false;
    lightUp(row, col, pauseColor); // Give instant feedback
    }else{
    updating = true;
    lightUp(row, col, playColor); // Give instant feedback
    }
}
// Clear board button
if(row == clearRow && col == clearCol){
    lightUp(row, col, pauseColor); // Give instant feedback
    for (let i = 0; i < numCols; i++) {
    boardState[i] = [];
    for (let j = 0; j < numRows; j++) {
        boardState[i][j] = 0;
        lightUp(i,j,offColor);
    }
    }
}
// Speed up button
if(row == speedUpRow && col == speedUpCol){
    lightUp(row, col, aliveColor); // Give instant feedback
    if(interval > minInterval){
    interval /= intervalScaleFactor;
    last_tempo_change = performance.now();
    console.log(`Interval: ${interval}`);
    }
}
// Slow down button
if(row == speedDownRow && col == speedDownCol){
    lightUp(row, col, aliveColor); // Give instant feedback
    if(interval < maxInterval){
    interval *= intervalScaleFactor;
    last_tempo_change = performance.now();
    console.log(`Interval: ${interval}`);
    }
}
// Scale left button
if(row == scaleLeftRow && col == scaleLeftCol){
    lightUp(row, col, aliveColor); // Give instant feedback
    scaleNum -= 1;
    if(scaleNum < 0){
    scaleNum += 12; // Loop around the circle
    }
    console.log(`Key: ${scaleNames[scaleNum]}`);
}
// Scale right button
if(row == scaleRightRow && col == scaleRightCol){
    lightUp(row, col, aliveColor); // Give instant feedback
    scaleNum += 1;
    if(scaleNum >= 12){
    scaleNum -= 12; // Loop around the circle
    }
    console.log(`Key: ${scaleNames[scaleNum]}`);
}
// Turn the button off after a fixed time
if(mouseClick){
    if(row == clearRow && col == clearCol || row == speedDownRow && col == speedDownCol || row == speedUpRow && col == speedUpCol || row == scaleLeftRow && col == scaleLeftCol || row == scaleRightRow && col == scaleRightCol){
    setTimeout(function() {
        onRelease(row,col);
    }, 100);
    }
}
}
function onRelease(row, col) {
// Turn off light on release
if(row == clearRow && col == clearCol || row == speedDownRow && col == speedDownCol || row == speedUpRow && col == speedUpCol || row == scaleLeftRow && col == scaleLeftCol || row == scaleRightRow && col == scaleRightCol){
    lightUp(row,col,offColor);
}
}
function getMIDIMessage(midiMessage) {
const command = midiMessage.data[0];
const note = midiMessage.data[1];
const velocity = midiMessage.data.length > 2 ? midiMessage.data[2] : 0;

const [row, col] = note_to_row_col_array(note);
// console.log(`Command: ${command}, Row: ${row}, Col: ${col}, Velocity: ${velocity}`);
if (velocity === 127) {
    // console.log(`Row: ${row}, Column: ${col}`);
    onClick(row, col);
}
if (velocity === 0){
    onRelease(row, col);
}
}
// Define the sysex function to send a System Exclusive (sysex) message
async function sysex(...bytes) {
const midiAccess = await navigator.requestMIDIAccess({ sysex: true });

// Get the first available MIDI output
const outputs = Array.from(midiAccess.outputs.values());
if (outputs.length === 0) {
    // console.error('No MIDI outputs available.');
    return;
}
const output = outputs[0];

const sysexMessage = [240, 0, 32, 41, 2, 13, ...bytes, 247];
output.send(sysexMessage);
}
function sleep(ms) {
return new Promise((resolve) => setTimeout(resolve, ms));
}
function lightUp(row, col, color) {
// Send message to the novation
const note = row_col_to_note(row, col);
sysex(3, 0, note, color);
// Light up the button
const cell = document.querySelector(`button[data-row="${row}"][data-col="${col}"]`);
if(cell){
    // Clear existing attributes
    cell.classList.remove('alive');
    cell.classList.remove('play');
    cell.classList.remove('pause');
    if(color == aliveColor){
    cell.classList.add('alive');
    }
    if(color == pauseColor){
    cell.classList.add('pause');
    }
    if(color == playColor){
    cell.classList.add('play');
    }
    if(color == waitingColor){
    cell.classList.add('waiting');
    }
    if(color == offColor){
    // Pass
    }
}
}
// Start-up commands
(async () => {
sysex(14, 1) // Enable programmer mode
sysex(1, 0, 0); // Clear lights
createGrid();
lightUp(pauseRow, pauseCol, pauseColor); // Give instant feedback
// renderBoardState();
while(true){ // Tell the browser to wait until the next 
    let next_tick_start = Math.ceil((performance.now() + 20 - last_tempo_change)/interval)*interval + last_tempo_change;
    await sleep(next_tick_start - performance.now());
    if(updating){
    updateBoardState();
    }
    generalGraphicsUpdate();
}
})();

// Game of life logic
function note_to_row_col_array(note){
return [8 - Math.floor(note / 10), (note % 10) - 1]
}
function row_col_to_note(row, col){
return (8 - row) * 10 + (col + 1); 
}
// Helper function to get the state of a cell with periodic boundary conditions
function getCellState(row, col) {
const wrappedRow = (row + numRows) % numRows;
const wrappedCol = (col + numCols) % numCols;
return boardState[wrappedRow][wrappedCol];
}
function updateBoardState(){
const nextBoardState = boardState.map(arr => arr.slice()); // Create deep copy of the board state
// Loop through each cell in the board
for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
    let liveNeighbors = 0;

    // Count live neighbors
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
        if (i !== 0 || j !== 0) { // Exclude the cell itself
            liveNeighbors += getCellState(row + i, col + j);
        }
        }
    }

    // Apply the rules of the Game of Life
    if (boardState[row][col] === 1) {
        // Any live cell with fewer than two or more than three live neighbors dies
        if (liveNeighbors < 2 || liveNeighbors > 3) {
        nextBoardState[row][col] = 0;
        // Stop sound if this is new
        if(boardState[row][col] == 1){
            lightUp(row,col, 0);
            if(USE_P5_SOUND){
            // getNote(row, col).stop();
            if(gridNotes[row][col]){
                gridNotes[row][col].stop();
            }
            }else{
            // getNote(row, col).pause();
            // getNote(row, col).currentTime = 0;
            if(gridNotes[row][col]){
                gridNotes[row][col].pause();
                gridNotes[row][col].currentTime = 0;
            }
            }
        }
        }
    } else {
        // Any dead cell with exactly three live neighbors becomes a live cell
        if (liveNeighbors === 3) {
        nextBoardState[row][col] = 1;
        // Play sound if this is new
        if(boardState[row][col] == 0){
            lightUp(row,col, aliveColor);
            // scales[scaleNum][col].play(duration=0.1);
            // getNote(row, col).play();
            gridNotes[row][col] = getNote(row, col).cloneNode(true);
            gridNotes[row][col].play();
            // scales[scaleNum][col].cloneNode(true).play();
            // let s = new Audio('notes/C3.wav');
            // s.play();
        }
        }
    }
    }
}
boardState = nextBoardState; // Update
}
function generalGraphicsUpdate(){
if(updating){
    lightUp(pauseRow,pauseCol, playColor);
}else{
    lightUp(pauseRow,pauseCol, pauseColor);
}
}
    