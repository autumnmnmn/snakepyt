
import { cartesian as cart } from "/code/math/complex.js";

export function projectiveShift(z, phi=0, psi=1) {
    const xMag = z.mag;
    const xAngle = z.angle;
    const angleDiff = xAngle - phi;
    const newMag = xMag + Math.cos(angleDiff);
    return cart(
        newMag * Math.cos(xAngle * psi),
        newMag * Math.sin(xAngle * psi)
    );
}



// claude-generated, not yet reviewed, probably jank
function fullThing(z, phi, psi, c_val, d_val, twist, squoosh_x, squoosh_y) {
    const shifted = projectiveShift(z, phi, psi);
    const halfEbb = cart(-c_val * 0.5, -d_val * 0.5);
    const mid = shifted.add(halfEbb);
    const mids = cart(mid.re / squoosh_x, mid.im / squoosh_y);

    const cosTwist = Math.cos(twist);
    const sinTwist = Math.sin(twist);
    const rotated = cart(
        mids.re * cosTwist - mids.im * sinTwist,
        mids.re * sinTwist + mids.im * cosTwist
    );

    return rotated.add(halfEbb);
}


export function translatedProjectiveShift(z, t, phi=0, psi=1) {
    const shifted = projectiveShift(z, phi, psi);
    return shifted.sub(t);
}


