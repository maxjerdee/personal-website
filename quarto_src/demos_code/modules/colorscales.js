import "../libs/chroma.min.js";

export function gradient(minval, maxval, lowc, highc, value){
    let f = chroma.scale([lowc, highc]).domain([minval,maxval]);
    let rgb = f(value).rgb();
    return [rgb[0],rgb[1],rgb[2],255];
}  