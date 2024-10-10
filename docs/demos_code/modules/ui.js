

export class Slider{
    constructor(p, props){
        this._props = props;
        this._layer = p.createGraphics(this._props.width, this._props.height); // Add two pixels to make a boundary
        
        this._layer.push();
        this._layer.strokeWeight(4);
        this._layer.rect(0, 0, this._props.width, this._props.height); // Outline box
        this._layer.pop();
        this._sliderobj = p.createSlider(this._props.min, this._props.max,this._props.def,this._props.step);
        this._sliderobj.position(this._props.x+10,this._props.y+35);
        this._sliderobj.size(this._props.width-20);
        this._sliderobj.addClass("engSliders");

        this._layer.textSize(18);
        this._layer.text(this._props.label,45,20);
    }

    draw(p){
        p.image(this._layer, this._props.x, this._props.y);
    }

    get_value(){
        return this._sliderobj.value();
    }

    


}