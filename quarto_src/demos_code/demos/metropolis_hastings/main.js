// Function to fetch and insert SVG content
function loadSVG() {
    fetch('../../../assets/images/blog/metropolis_hastings/frog/FrogSit.svg')
    .then(response => response.text())
    .then(data => {
        document.getElementById('simulation').innerHTML = data;
    })
    .catch(error => console.error('Error fetching the SVG:', error));
}


// // Begin interactive bar plot
// // Set up the SVG container dimensions
// const margin = { top: 20, right: 30, bottom: 40, left: 40 };
// const width = 600 - margin.left - margin.right;
// const height = 400 - margin.top - margin.bottom;

// const svg = d3.select("#barPlot")
//     .attr("width", width + margin.left + margin.right)
//     .attr("height", height + margin.top + margin.bottom)
// .append("g")
//     .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// // Sample data
// const data = [30, 50, 20];

// // Set the scales
// const x = d3.scaleBand()
//     .domain(d3.range(data.length))
//     .range([0, width])
//     .padding(0.1);

// const y = d3.scaleLinear()
//     .domain([0, d3.max(data)])
//     .nice()
//     .range([height, 0]);

// // Append the rectangles for the bar chart
// svg.selectAll(".bar")
// .data(data)
// .enter().append("rect")
//     .attr("class", "bar")
//     .attr("x", (d, i) => x(i))
//     .attr("y", d => y(d))
//     .attr("height", d => height - y(d))
//     .attr("width", x.bandwidth())
//     .call(d3.drag()
//         .on("drag", function(event, d) {
//             const mouseY = event.y;
//             const newHeight = height - mouseY;
//             const newValue = y.invert(mouseY);
//             if (newValue >= 0 && newValue <= d3.max(data)) {
//                 d3.select(this)
//                     .attr("y", mouseY)
//                     .attr("height", newHeight)
//                     .datum(newValue);
//             }
//         })
//     );

// // Add the X Axis
// svg.append("g")
//     .attr("transform", "translate(0," + height + ")")
//     .call(d3.axisBottom(x).tickFormat(i => `Bar ${i + 1}`));

// // Add the Y Axis
// svg.append("g")
//     .call(d3.axisLeft(y));
// // End interactive bar plot

// Red: #8d0b19, #c72f25, #bf0502
// Blue: #2b59c9, #4735ea


// Event listener to change the color of the SVG circle
document.getElementById('changeColorButton').addEventListener('click', function() {
    // Generate a random color
    var randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
    console.log(randomColor);
    // Darken color
    var darkenColor = d3.color(randomColor).darker().toString();

    // Get all elements with the class 'st1'
    var light_elements = document.querySelectorAll('.st1');
    if (light_elements) {
        // Change the fill attribute of each element
        light_elements.forEach(element => {
        element.style.fill = randomColor; // Needed to override the css
        })
    }
    var dark_elements = document.querySelectorAll('.st2');
    if (dark_elements) {
        // Change the fill attribute of each element
        dark_elements.forEach(element => {
        element.style.fill = darkenColor; // Needed to override the css
        })
    }
});

// Load the SVG when the document is ready
document.addEventListener('DOMContentLoaded', loadSVG);