
export class Network{
    constructor(p, props){
        this._props = props;
        this._layer = p.createGraphics(this._props.width, this._props.height); // Add two pixels to make a boundary
        //this._layer.rect(0, 0, this._props.width, this._props.height); // Outline box

        this._nodeprops = {box_max_width: Math.floor(this._props.width*0.3), box_max_height: this._props.height/Math.max(this._props.layout.n_left,this._props.layout.n_right)};
        this._nodeprops.max_radius = Math.min(this._nodeprops.box_max_height,this._nodeprops.box_max_width)/2;
        this.update_layer_bipartite();
    }

    draw(p){
        p.image(this._layer, this._props.x, this._props.y);
    }

    update_layer_bipartite(){
        for(let i=0; i<this._props.layout.n_left; i++){
            //this._layer.rect(0,i*this._nodeprops.box_max_height,this._nodeprops.max_radius*2,this._nodeprops.max_radius*2);
            this._layer.push();
            this._layer.fill(255,0,0);
            this._layer.circle(0+this._nodeprops.max_radius,i*this._nodeprops.box_max_height+this._nodeprops.max_radius,this._nodeprops.max_radius*2-3);
            this._layer.pop();
        }
        for(let j=0; j<this._props.layout.n_right; j++){
            //this._layer.rect(this._props.width-this._nodeprops.max_radius*2,j*this._nodeprops.box_max_height, this._nodeprops.max_radius*2,this._nodeprops.max_radius*2);
            this._layer.push();
            this._layer.fill(0,0,255);
            this._layer.circle(this._props.width-this._nodeprops.max_radius,j*this._nodeprops.box_max_height+this._nodeprops.max_radius,this._nodeprops.max_radius*2-3);
            this._layer.pop();
        }
    }
}


