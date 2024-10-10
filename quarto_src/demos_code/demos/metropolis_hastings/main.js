var animation_speed = 1; // Number of frames to skip in the animation
var global_beta = 0;
var num_frogs = 1;
var lilypad_flies = [2,5,3]; // Number of flies on each lilypad
var lilypad_frogs = [0,0,0]; // Number of frogs on each lilypad
var accumulated_count = [0,0,0];
var accumulating_count = false;
var global_frog_size = 30;
var fly_size = 2.5;

// Canvas properties
const canvas_props = {
    width: 600,
    height: 500
};

const frog_props = {
    animation_frames: 60, // Number of frames in an animation of a move (whether it is accepted or rejected)
    animation_angles_accept: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // animation angles relative to the line connecting current_pos to proposed_pos
    animation_translations_accept: [0.0166667, 0.0333333, 0.05, 0.0666667, 0.0833333, 0.1, 0.116667, 0.133333, 0.15, 0.166667, 0.183333, 0.2, 0.216667, 0.233333, 0.25, 0.266667, 0.283333, 0.3, 0.316667, 0.333333, 0.35, 0.366667, 0.383333, 0.4, 0.416667, 0.433333, 0.45, 0.466667, 0.483333, 0.5, 0.516667, 0.533333, 0.55, 0.566667, 0.583333, 0.6, 0.616667, 0.633333, 0.65, 0.666667, 0.683333, 0.7, 0.716667, 0.733333, 0.75, 0.766667, 0.783333, 0.8, 0.816667, 0.833333, 0.85, 0.866667, 0.883333, 0.9, 0.916667, 0.933333, 0.95, 0.966667, 0.983333, 1.], // linear progress (from 0 to 1) along the segment connecting current_pos to proposed_pos
    animation_leaping_accept: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

    animation_angles_reject: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180, 180],
    animation_translations_reject: [0.0166667, 0.0333333, 0.05, 0.0666667, 0.0833333, 0.1, 0.116667, 0.133333, 0.15, 0.166667, 0.183333, 0.2, 0.216667, 0.233333, 0.25, 0.266667, 0.283333, 0.3, 0.316667, 0.333333, 0.35, 0.366667, 0.358333, 0.341667, 0.325, 0.308333, 0.291667, 0.275, 0.258333, 0.241667, 0.225, 0.208333, 0.191667, 0.175, 0.158333, 0.141667, 0.125, 0.108333, 0.0916667, 0.075, 0.0583333, 0.0416667, 0.025, 0.00833333, 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0.,0.],
    animation_leaping_reject: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

    leaping_path: '../../../assets/images/blog/metropolis_hastings/frog/FrogLeap.svg',
    sitting_path: '../../../assets/images/blog/metropolis_hastings/frog/FrogSit.svg',

    beta_0_color: '#c72f25', // Color of the explorer frog // Dark: #ad2920
    beta_1_color: '#739056', // Color of the sampler frog // Dark: #647d4b
    beta_inf_color: '#4735ea', // Color of the exploiter frog // Dark: #3e2ecb
}

const lilypad_props = {
    path: '../../../assets/images/blog/metropolis_hastings/Lilypad.png',
    radius: 50, // In pixels, used to constrain the frog offsets
    num_lilypads: 3,
}

const fly_props = {
    paths: ['../../../assets/images/blog/metropolis_hastings/fly/Fly_1.svg', '../../../assets/images/blog/metropolis_hastings/fly/Fly_2.svg', '../../../assets/images/blog/metropolis_hastings/fly/Fly_3.svg', '../../../assets/images/blog/metropolis_hastings/fly/Fly_4.svg', '../../../assets/images/blog/metropolis_hastings/fly/Fly_5.svg'],

}

// Convert beta \in [0, \infty) to z \in [0,1] (slider values)
function beta_to_z(beta) {
    return 2/Math.PI*Math.atan(beta);
}

function z_to_beta(z){
    return Math.tan(Math.PI*z/2);
}

// Color will change linearly in this transformed coordinate
function z_to_color(z) {
    if(z <= 1/2){ // beta \in [0,1]
        return d3.interpolateRgb(frog_props.beta_0_color, frog_props.beta_1_color)(2*z);
    }else{ // beta > 1
        return d3.interpolateRgb(frog_props.beta_1_color, frog_props.beta_inf_color)(2*z - 1);
    }
}

// Select the canvas and get the 2D rendering context
const canvas = d3.select('#simulation')
    .append('canvas')
    .attr('width', canvas_props.width)
    .attr('height', canvas_props.height);

const ctx = canvas.node().getContext('2d');

// Lilypads that the frogs hop between
class Lilypad {
    constructor(x_init, y_init, size){
        this.pos = {x: x_init, y: y_init};
        this.size = size;
        this.img = new Image();
        this.img.src = lilypad_props.path;
        this.imgLoaded = false;
        this.img.onload = () => { this.imgLoaded = true; };
    }
    // Draw
    draw(ctx) {
        if (this.img) {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            ctx.scale(this.size / 100, this.size / 100);
            ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2, this.img.width, this.img.height);
            ctx.restore();
        }
    }
}

// Flies that fly over the lilypads (lilypads should be populated)
class Fly {
    constructor(lilypad_index=0, size=10){
        this.lilypad_index = lilypad_index;
        this.size = size;
        this.img = null;
        this.type = Math.floor(Math.random()*5);
        this.rel_pos = {x:(Math.random()-0.5)*lilypad_props.radius,y: - 2*lilypad_props.radius + (Math.random()-0.5)*lilypad_props.radius}; // Position relative to the center of the lilypad
        this.pos = {x:lilypads[lilypad_index].pos.x + this.rel_pos.x, y:lilypads[lilypad_index].pos.y + this.rel_pos.y};
        this.vel = {x:Math.random()-0.5,y:Math.random()-0.5};
        this.angle = Math.random()*60 - 30;
    }

    // Load the svg image
    loadImage(callback=(() => {})) {
        var svgPath = fly_props.paths[this.type];
        d3.xml(svgPath).then(data => {
            var svgNode = document.importNode(data.documentElement, true);
            const svg = new XMLSerializer().serializeToString(svgNode);
            this.img = new Image();
            this.img.onload = () => {
                if (callback) callback();
            };
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const blobURL = URL.createObjectURL(blob);
            this.img.src = blobURL;
        }).catch(error => {
            console.error('Error loading the SVG:', error);
        });
    }

    // Update the physics of the flies
    update(){
        this.rel_pos.x += this.vel.x;
        this.rel_pos.y += this.vel.y;
        this.pos.x = this.rel_pos.x + lilypads[this.lilypad_index].pos.x;
        this.pos.y = this.rel_pos.y + lilypads[this.lilypad_index].pos.y;
        this.vel.x -= (this.rel_pos.x/lilypad_props.radius)/100 + 0.05*(Math.random() - 0.5);
        this.vel.y -= (this.rel_pos.y/lilypad_props.radius + 2)/(100*lilypad_flies[this.lilypad_index]) + 0.05*(Math.random() - 0.5);
        this.vel.x *= 0.998;
        this.vel.y *= 0.998;
        this.angle = -50*this.vel.x; // Banking
    }
    
    // Draw the flies
    draw(ctx) {
        if (this.img) {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            ctx.rotate(this.angle * Math.PI / 180);
            ctx.scale(this.size / 100, this.size / 100);
            ctx.drawImage(this.img, this.img.width/2, this.img.height/2); // 
            ctx.restore();
        }
    }
    
}

// Define the Frog class
class Frog {
    constructor(x_init=0,y_init=0,size=50,beta=1) {
        this.beta = beta;
        
        var radius = Math.random()*lilypad_props.radius;
        this.angle = Math.random() * 360;

        this.offset_pos = {x:radius*Math.cos(this.angle), y:radius*Math.sin(this.angle)}; // Used to offset the targets of the frogs on the lilypads so that they don't all overlap
        this.pos = {x: x_init + this.offset_pos.x, 
                    y: y_init + this.offset_pos.y};
        this.size = size;

        // Repeats for the animation states
        this.leaping_img = {
            img: null, 
            svgWidth: 0, // Used to offest so the image is centered in rotations
            svgHeight: 0,
            svgNode: null
        };
        this.sitting_img = {
            img: null, 
            svgWidth: 0,
            svgHeight: 0,
            svgNode: null
        };


        // Position as in will be registered on the bar plot
        this.current_pos = {x:this.pos.x,y:this.pos.y};
        this.proposed_pos = {x:this.pos.x,y:this.pos.y};
        this.current_lilypad = 0;
        this.proposed_lilypad = 1;

        // this.accept = true;
        this.accept = false;
        // Animation information
        this.leaping = false;
        this.in_animation = false;
        this.animation_frame = 0;

        // Turn animation 
        this.turn_animation_counter = 0;
        this.turn_animation_speed = 0;
    }

    // Load the svg images (insert a given color)
    loadImages(callback=(() => {})) {
        var color = z_to_color(beta_to_z(this.beta));
        // Darken the color for the shading
        var darkColor = d3.color(color).darker(0.4).toString();

        var svgPath;
        // leaping
        svgPath = frog_props.leaping_path;
        d3.xml(svgPath).then(data => {
            this.leaping_img.svgNode = document.importNode(data.documentElement, true);
            const viewBox = this.leaping_img.svgNode.getAttribute('viewBox').split(' ');
            this.leaping_img.svgWidth = parseFloat(viewBox[2]);
            this.leaping_img.svgHeight = parseFloat(viewBox[3]);
            var light_elements = this.leaping_img.svgNode.querySelectorAll('.st1, .st2');
            if (light_elements) {
                // Change the fill attribute of each element
                light_elements.forEach(element => {
                element.style.fill = color; // Needed to override the css
                })
            }
            var dark_elements = this.leaping_img.svgNode.querySelectorAll('.st3');
            if (dark_elements) {
                // Change the fill attribute of each element
                dark_elements.forEach(element => {
                element.style.fill = darkColor; // Needed to override the css
                })
            }
            const svg = new XMLSerializer().serializeToString(this.leaping_img.svgNode);
            this.leaping_img.img = new Image();
            this.leaping_img.img.onload = () => {
                if (callback) callback();
            };
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const blobURL = URL.createObjectURL(blob);
            this.leaping_img.img.src = blobURL;
        }).catch(error => {
            console.error('Error loading the SVG:', error);
        });
        // sitting
        svgPath = frog_props.sitting_path;
        d3.xml(svgPath).then(data => {
            this.sitting_img.svgNode = document.importNode(data.documentElement, true);
            const viewBox = this.sitting_img.svgNode.getAttribute('viewBox').split(' ');
            this.sitting_img.svgWidth = parseFloat(viewBox[2]);
            this.sitting_img.svgHeight = parseFloat(viewBox[3]);
            var light_elements = this.sitting_img.svgNode.querySelectorAll('.st1'); // Note that these are different classes for leaping and sitting
            if (light_elements) {
                // Change the fill attribute of each element
                light_elements.forEach(element => {
                element.style.fill = color; // Needed to override the css
                })
            }
            var dark_elements = this.sitting_img.svgNode.querySelectorAll('.st2');
            if (dark_elements) {
                // Change the fill attribute of each element
                dark_elements.forEach(element => {
                element.style.fill = darkColor; // Needed to override the css
                })
            }
            const svg = new XMLSerializer().serializeToString(this.sitting_img.svgNode);
            this.sitting_img.img = new Image();
            this.sitting_img.img.onload = () => {
                if (callback) callback();
            };
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const blobURL = URL.createObjectURL(blob);
            this.sitting_img.img.src = blobURL;
        }).catch(error => {
            console.error('Error loading the SVG:', error);
        });
    }

    update() {
        // Update the 
        if(this.in_animation){
            this.animation_frame += animation_speed;
            if(this.animation_frame >= frog_props.animation_frames){
                this.animation_frame = 0;
                this.in_animation = false;
                this.leaping = false;
                // Update the current position (if the move was accepted)
                if(this.accept){
                    this.current_lilypad = this.proposed_lilypad;
                    this.current_pos.x = this.proposed_pos.x;
                    this.current_pos.y = this.proposed_pos.y;
                }
                this.pos.x = this.current_pos.x;
                this.pos.y = this.current_pos.y;
            }
        }
        // Calculate the appropriate angle and position given the animation state
        if(this.in_animation){
            var translation = 0;
            this.angle = 180 * Math.atan2(this.proposed_pos.y - this.current_pos.y, this.proposed_pos.x - this.current_pos.x)/ Math.PI + 90; // Angle from current_pos to proposed_pos (need to orient by extra 90 degree rotation)
            if(this.accept){
                translation = frog_props.animation_translations_accept[this.animation_frame];
                this.angle += frog_props.animation_angles_accept[this.animation_frame];
                this.leaping = (frog_props.animation_leaping_accept[this.animation_frame] == 1);
            }else{
                translation = frog_props.animation_translations_reject[this.animation_frame];
                this.angle += frog_props.animation_angles_reject[this.animation_frame];
                this.leaping = (frog_props.animation_leaping_reject[this.animation_frame] == 1);
            }
            // Linear interpolation between the current and proposed positions
            this.pos.x = (1 - translation)*this.current_pos.x + translation*this.proposed_pos.x;
            this.pos.y = (1 - translation)*this.current_pos.y + translation*this.proposed_pos.y;
        }else{
            // Run logic to determine the next proposal
            if(Math.random() < 0.01*animation_speed){ // Make a proposal (This is the MCMC!)
                var proposed_lilypad = Math.floor(Math.random() * 3);
                if(proposed_lilypad != this.current_lilypad){
                    // Consider the proposal, animation whether or not it is accepted
                    this.in_animation = true;
                    this.proposed_lilypad = proposed_lilypad;
                    this.proposed_pos.x = lilypads[proposed_lilypad].pos.x + this.offset_pos.x;
                    this.proposed_pos.y = lilypads[proposed_lilypad].pos.y + this.offset_pos.y;

                    // Accept/Reject!
                    var accept_prob = Math.min(Math.pow(lilypad_flies[proposed_lilypad]/lilypad_flies[this.current_lilypad],this.beta),1);
                    this.accept = (Math.random() < accept_prob);
                    
                }
                // Rerandomize the frog offset
                var radius = Math.random()*lilypad_props.radius;
                var angle = Math.random() * 360;

                this.offset_pos = {x:radius*Math.cos(angle), y:radius*Math.sin(angle)};
            }
            // Randomly shift direction (this is just a visual effect, and will not be sped up by the animation_speed)
            if(Math.random() < 0.02){
                this.turn_animation_speed = Math.random()*4 - 2;
                this.turn_animation_counter = 10;

                // Easy way to implement random cooling:
                // this.beta += 0.1;
                // this.loadImages(); // Need to reload to change the color
                // if(Math.random() < 0.1){
                //     animation_speed++;
                //     console.log(animation_speed);
                // }
            }
            if(this.turn_animation_counter > 0){
                this.turn_animation_counter--;
                this.angle += this.turn_animation_speed;
            }
        }
    }

    draw(ctx) {
        var img;
        if(this.leaping){
            img = this.leaping_img;
        }else{
            img = this.sitting_img;
        }
        if (img.img) {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            ctx.rotate(this.angle * Math.PI / 180);
            ctx.scale(this.size / 100, this.size / 100);
            ctx.drawImage(img.img, -img.svgWidth / 3, -img.svgHeight / 3); // This is just a hack, seems to be sensitive to the size of the surrounding div
            ctx.restore();
        }
    }
}

// List all Lilypads
const lilypads = [
    new Lilypad(100,400,15),
    new Lilypad(300,200,15),
    new Lilypad(500,400,15)
]

// All flies
const flies = [
    new Fly(0,fly_size),
    new Fly(0,fly_size),
    new Fly(1,fly_size),
    new Fly(1,fly_size),
    new Fly(1,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),

    new Fly(0,fly_size),
    new Fly(0,fly_size),
    new Fly(1,fly_size),
    new Fly(1,fly_size),
    new Fly(1,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size),
    new Fly(2,fly_size)
]

// Load all fly images (svg hack)
let loadCount = 0;
flies.forEach(fly => {
    fly.loadImage();
});

// Create a list of frogs
const frogs = [
    new Frog(lilypads[0].pos.x,lilypads[0].pos.y,30,global_beta)
];

// Load all frog images (svg hack)
loadCount = 0;
frogs.forEach(frog => {
    frog.loadImages(() => {
        loadCount++;
        if (loadCount === frogs.length) {
            startAnimation();
        }
    });
});

// FPS counter variables
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;

function calculateFPS() {
    const now = performance.now();
    const delta = now - lastFrameTime;
    fps = 1000 / delta;
    lastFrameTime = now;
}

// Update the FPS counter on the page
function updateFPSCounter() {
    document.getElementById('fps').innerText = `FPS: ${Math.round(fps)}`;
}

// Animation function
function animate(time) {
    // Set the background color to sea blue
    ctx.fillStyle = '#4682b4';
    ctx.fillRect(0, 0, canvas_props.width, canvas_props.height);
    // ctx.clearRect(0, 0, canvas_props.width, canvas_props.height); // Clear screen

    // Draw the lilypads
    lilypads.forEach(lilypad => {
        lilypad.draw(ctx);
    });

    // Update and draw each frog
    frogs.forEach(frog => {
        frog.update();
        frog.draw(ctx);
    });

    // Update and draw each fly
    flies.forEach(fly => {
        fly.update();
        fly.draw(ctx);
    });

    // Update the data for the bar plot
    for(let i = 0; i < lilypad_props.num_lilypads; i++){
        lilypad_frogs[i] = 0;
    }
    frogs.forEach(frog => {
        lilypad_frogs[frog.current_lilypad]++;
    });

    var total_flies = 0;
    var total_accumulated_count = 0;
    for(let i = 0; i < lilypad_props.num_lilypads; i++){
        total_flies += lilypad_flies[i]; 
        if(accumulating_count){
            accumulated_count[i] += lilypad_frogs[i];
            total_accumulated_count += accumulated_count[i];
        }
    }

    for(let i = 0; i < lilypad_props.num_lilypads; i++){
        data[i].interactive = lilypad_flies[i]/total_flies*100;
        if(accumulating_count){
            data[i].static = accumulated_count[i]/total_accumulated_count*100;
        }else{
            data[i].static = lilypad_frogs[i]/num_frogs*100;
        }
    }
    // console.log(data[0]);
    // Update the bar plot
    // Update Y scale domain
    y.domain([0, d3.max(data.map(d => Math.max(d.interactive, d.static)))]).nice();
    // console.log(y);

    // Update scales
    svg.select(".y.axis")
        .transition()
        .duration(100)
        .call(d3.axisLeft(y));

    staticBars.data(data)
        .transition()
        .duration(100)
        .attr("y", d => y(d.static))
        .attr("height", d => height - y(d.static));

    interactiveBars.data(data)
        .transition()
        .duration(100)
        .attr("y", d => y(d.interactive))
        .attr("height", d => height - y(d.interactive));
    // console.log(data);

    // Calculate and display FPS
    calculateFPS();
    updateFPSCounter();

    requestAnimationFrame(animate);
}


// Bar plot
// Set up the SVG container dimensions
const margin = { top: 20, right: 30, bottom: 40, left: 40 };
const width = 650 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

const svg = d3.select("#barPlot")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Sample data
var data = [
    { interactive: 20, static: 10 },
    { interactive: 50, static: 40 },
    { interactive: 30, static: 20 }
];

// Set the scales
const x0 = d3.scaleBand()
    .domain(d3.range(data.length))
    .range([0, width])
    .padding(0.2);

const x1 = d3.scaleBand()
    .domain(['interactive', 'static'])
    .range([0, x0.bandwidth()])
    .padding(0.1);

const y = d3.scaleLinear()
    // .domain([0, d3.max(data.map(d => Math.max(d.interactive, d.static)))])
    .domain([0, 100])
    .nice()
    .range([height, 0]);

// Append the static bars
const staticBars = svg.selectAll(".bar-static")
.data(data)
.enter().append("rect")
.attr("class", "bar-static")
.attr("x", (d, i) => x0(i) + x1('static'))
.attr("y", d => y(d.static))
.attr("fill", z_to_color(beta_to_z(global_beta)))
.attr("height", d => height - y(d.static))
.attr("width", x1.bandwidth());

// Append the interactive bars
const interactiveBars = svg.selectAll(".interactive-bar")
  .data(data)
  .enter().append("rect")
    .attr("class", "bar interactive-bar")
    .attr("x", (d, i) => x0(i) + x1('interactive'))
    .attr("y", d => y(d.interactive))
    .attr("height", d => height - y(d.interactive))
    .attr("width", x1.bandwidth())
    .call(d3.drag()
        .on("drag", function(event, d) {
            const index = data.indexOf(d);
            const mouseY = event.y;
            const newValue = y.invert(mouseY);
            if (newValue >= 0 && newValue <= d3.max(data.map(d => d.static))) {
                data[index].interactive = newValue;  // Update the data
                d3.select(this)
                    .attr("y", y(newValue))  // Update the bar position
                    .attr("height", height - y(newValue));  // Update the bar height
            }
        })
    );

// Add the X Axis
svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x0).tickFormat(i => `Lilypad ${i + 1}`));

// Add the Y Axis
svg.append("g")
    .call(d3.axisLeft(y))
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", -margin.left + 10)
    .attr("x", -height / 2)
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .text("%");

 // Add legend
 const legend = svg.append("g")
 .attr("class", "legend")
 .attr("transform", `translate(${width - 100}, 10)`);

const legendData = [
 { label: "% flies", color: "gray" },
 { label: "% frogs", color: z_to_color(beta_to_z(global_beta)) }
];

legend.selectAll("rect")
 .data(legendData)
 .enter().append("rect")
 .attr("x", 0)
 .attr("y", (d, i) => i * 20)
 .attr("width", 18)
 .attr("height", 18)
 .style("fill", d => d.color);

legend.selectAll("text")
 .data(legendData)
 .enter().append("text")
 .attr("x", 24)
 .attr("y", (d, i) => i * 20 + 9)
 .attr("dy", ".35em")
 .text(d => d.label);


// GUI

const sliders = [
    { valueDisplay: document.getElementById('frogZ'), slider: document.getElementById('frogZSlider') },
    { valueDisplay: document.getElementById('frogCount'), slider: document.getElementById('frogCountSlider') },
    { valueDisplay: document.getElementById('simulationSpeed'), slider: document.getElementById('simulationSpeedSlider') }
];

// update he frogBeta with the transformed slider value
document.getElementById('frogZSlider').addEventListener('input', (event) => {
    global_beta = z_to_beta(document.getElementById('frogZSlider').value);
    if(global_beta > 900){
        document.getElementById('frogBeta').innerText = "β = ∞";
    }else{
        document.getElementById('frogBeta').innerText = `β = ${parseFloat(global_beta).toPrecision(3)}`; // "&#946; = 
    }
    frogs.forEach(frog => {
        frog.beta = global_beta;
    });
});

// It is intensive to go through the whole range, so only update the frog colors on stop
document.getElementById('frogZSlider').onchange = function() {
    // Set all of the frog betas to the new value and update the graphics
    frogs.forEach(frog => {
        frog.beta = global_beta;
        frog.loadImages();
    });
    // Change the bar colors
    staticBars.data(data).attr("fill", z_to_color(beta_to_z(global_beta)));
    legendData[1].color = z_to_color(beta_to_z(global_beta));
    legend.selectAll("rect")
    .data(legendData)
    .style("fill", d => d.color);
}

// Update the frogCount indicator
document.getElementById('frogCountSlider').addEventListener('input', (event) => {
    var old_num_frogs = num_frogs;
    num_frogs = parseInt(document.getElementById('frogCountSlider').value);
    document.getElementById('frogCount').innerText = num_frogs;
    if(num_frogs > old_num_frogs){ // Add new frogs
        for(let i = 0; i < num_frogs - old_num_frogs; i++){
            frogs.push(new Frog(lilypads[0].pos.x,lilypads[0].pos.y,30,global_beta));
            frogs[frogs.length - 1].loadImages();
        }
    }else{ // Remove frogs
        for(let i = 0; i < old_num_frogs - num_frogs; i++){
            frogs.pop();
        }
    }
    // Change size
    
    if(num_frogs < 5){
        global_frog_size = 30;
    }else{
        if(num_frogs < 10){
            global_frog_size = 20;
        }else{
            global_frog_size = 15;
        }
    }
    
    frogs.forEach(frog => {
        frog.size = global_frog_size;
    });
});

// Change the simulation speed
document.getElementById('simulationSpeedSlider').addEventListener('input', (event) => {
    animation_speed = parseInt(document.getElementById('simulationSpeedSlider').value);
});

// Add event listener for the toggle switch if needed
const frogToggle = document.getElementById('frogToggle');
frogToggle.addEventListener('change', (event) => {
    if (event.target.checked) {
        accumulating_count = true;
    } else {
        accumulating_count = false;
        // This will also clear the accumulated counts
        for(let i = 0; i < lilypad_props.num_lilypads; i++){
            accumulated_count[i] = 0;
        }
    }
});


// Start the animation
function startAnimation() {
    requestAnimationFrame(animate);
}