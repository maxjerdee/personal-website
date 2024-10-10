
export function bounding_box(x,y,w,h,angle){
    
    let xs = [x, x+w*Math.cos(angle), x+h*Math.sin(angle), x + h*Math.sin(angle)+w*Math.cos(angle)];
    let ys = [y, y-w*Math.sin(angle), y+h*Math.cos(angle), y+h*Math.cos(angle)-w*Math.sin(angle)];
    
    let return_dims =  {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys)};

    return return_dims;
}

export function cartesian_dist(x1,y1,x2,y2){
    return Math.sqrt(Math.pow(x1-x2,2.0)+Math.pow(y1-y2,2.0));
}

export function gaussian(x,std){
    return Math.exp(-x*x/(2.0*std*std));
}

export function getmax(arr) {
    let len = arr.length;
    let max = -Infinity;

    while (len--) {
        max = arr[len] > max ? arr[len] : max;
    }
    return max;
}