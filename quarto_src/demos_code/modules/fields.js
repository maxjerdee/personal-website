import { cartesian_dist, gaussian, getmax } from "./geometry.js";
import { gradient } from "./colorscales.js"

export class ScalarField{
    constructor(p, props){
        this._props = props;
        this._layer = p.createImage(this._props.width, this._props.height); // Add two pixels to make a boundary
        this._values = new Array(props.width*props.height).fill(0.0);
    }

    add_gaussian_source(x,y, threshold, std){

        let xmin = x-threshold;
        let xmax = x+threshold;
        let ymin = y-threshold;
        let ymax = y+threshold;

        //this._layer.loadPixels();
        for(let xt = xmin; xt < xmax; xt += 1){
            for(let yt = ymin; yt < ymax; yt += 1 ){
                let dist = cartesian_dist(x,y,xt,yt);
                if(dist<threshold){
                    let val = gaussian(dist,std);
                    this._values[this._props.width*yt+xt] += val;
                }
            }
        }
        this.normalize_and_update(x,y,threshold);
    }

    normalize_and_update(x, y, threshold){

        let xmin = x-threshold;
        let xmax = x+threshold;
        let ymin = y-threshold;
        let ymax = y+threshold;

        this._layer.loadPixels();
        for(let xt = xmin; xt < xmax; xt += 1){
            for(let yt = ymin; yt < ymax; yt += 1 ){
                let dist = cartesian_dist(x,y,xt,yt);
                if(dist<threshold){
                    let pixidx = 4*(yt*this._props.width + xt);
                    let value = this._values[this._props.width*yt+xt];

                    let [r,g,b,a] = gradient(0,1,"#ffffff","#ff0000",value);
                    // Red.
                    this._layer.pixels[pixidx] = r
                    // Green.
                    this._layer.pixels[pixidx+1] = g;
                    // Blue.
                    this._layer.pixels[pixidx+2] = b;
                    // Alpha.
                    this._layer.pixels[pixidx+3] = a;
                }
            }
        }

        this._layer.updatePixels();
    }

    draw(p){
        p.image(this._layer,this._props.x,this._props.y);
    }



}