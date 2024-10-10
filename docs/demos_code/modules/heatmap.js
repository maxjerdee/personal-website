
export class Heatmap{
    constructor(p, props){
        this._props = props;
        this._layer = p.createGraphics(this._props.width+2,this._props.height+2); // Add two pixels to make a boundary
        this._data = Array(this._props.ny * this._props.nx).fill(0); // Create  an empty array of zeros
        this._cells = {width: this._props.width/this._props.nx, height: this._props.height/this._props.ny};
        this.update_layer();
    }

    draw(p){
        // Draw cached heatmap layer to canvas
        p.image(this._layer,this._props.x,this._props.y);
    }

    update_data(data){
        // Update the data and then the cached layer
        this._data = data;
        this.update_layer();
    }

    update_data_at(idx,idy,val){
        // Update the data at idx, idy and then the cached layer
        this._data[idy*this._props.nx + idx] = val;
        this.update_layer_at(idx,idy);
    }

    update_layer(){
        // Update the cached layer based on current data
        this._layer.clear();
        for(let id=0; id<this._data.length; id++){
            let idx = id%this._props.nx;
            let idy = Math.floor(id/this._props.nx);
            this.update_layer_at(idx, idy);
        }

        // Draw outline
        this._layer.push();
        this._layer.fill(0,0,0,0);
        this._layer.stroke(1);
        this._layer.strokeWeight(2);
        this._layer.rect(0,0,this._props.width+2,this._props.height+2);
        this._layer.pop();
    }

    update_layer_at(idx, idy){
        // Update the rect at idx,idy using current data
        this._layer.push();
        this._layer.fill(this._props.cscale(this._data[idy*this._props.nx + idx]).rgb());
        this._layer.noStroke();
        this._layer.rect(1+idx * this._cells.width, 1+idy * this._cells.height, this._cells.width, this._cells.height);
        this._layer.pop();
    }

}