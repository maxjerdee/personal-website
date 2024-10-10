// Set up the SVG container dimensions
const margin = { top: 20, right: 30, bottom: 40, left: 40 };
const width = 800 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

const svg = d3.select("#barPlot")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Sample data
const data = [
    { interactive: 20, static: 10},
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
    .domain([0, d3.max(data.map(d => Math.max(d.interactive, d.static)))])
    .nice()
    .range([height, 0]);

// Append the static bars
svg.selectAll(".static-bar")
  .data(data)
  .enter().append("rect")
    .attr("class", "static-bar")
    .attr("x", (d, i) => x0(i) + x1('static'))
    .attr("y", d => y(d.static))
    .attr("height", d => height - y(d.static))
    .attr("width", x1.bandwidth());

// Append the interactive bars
const bars = svg.selectAll(".interactive-bar")
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
    .call(d3.axisLeft(y));
