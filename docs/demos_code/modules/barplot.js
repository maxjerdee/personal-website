import { bounding_box } from "./geometry.js";

export class Barplot{
    constructor(p, props){
        this._props = props;
        this._props.angle_rad = this._props.angle * (Math.PI/180);
        this._box = bounding_box(this._props.x, this._props.y, this._props.width, this._props.height, this._props.angle_rad); 
        this._layer = p.createGraphics(this._box.width,this._box.height); // Add two pixels to make a boundary
        
        // Show bounding box
        //this._layer.rect(0, 0, this._box.width, this._box.height);

        this._data = Array.from(this._props.domain);
        this._data = this._data.map((x) => (x-10)*(x-10)*0.009);
        this._bars = {width: this._props.width/this._data.length, height: this._props.height};
        this.update_layer();
    }

    draw(p){
        p.image(this._layer, this._box.x, this._box.y);
    }

    update_data(data){
        this._data = data;
        this.update_layer();
    }

    update_layer(){
         // Update the cached layer based on current data
        this._layer.clear();
        for(let id=0; id<this._data.length; id++){
            this.update_layer_at(id);
        }
    }

    update_layer_at(id){
        // Update bar at id using current data
        this._layer.push();
        this._layer.translate(this._props.x-this._box.x,this._props.y-this._box.y);
        this._layer.rotate(-this._props.angle_rad);
        this._layer.fill(this._props.color);
        this._layer.stroke(0);
        this._layer.strokeWeight(1);
        this._layer.rect(id*this._bars.width,this._bars.height-(this._data[id])*this._bars.height,this._bars.width,this._data[id]*this._bars.height);
        this._layer.pop();
    }

}