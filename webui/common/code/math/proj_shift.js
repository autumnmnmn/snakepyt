
import "/code/math/complex.js";

const c = $complex.cartesian;

export function projectiveShift(z, phi=0, psi=1) {
    const xMag = c.mag(z);
    const xAngle = c.angle(z);
    const angleDiff = xAngle - phi;
    const newMag = xMag + Math.cos(angleDiff);
    return {
        re: newMag * Math.cos(xAngle * psi),
        im: newMag * Math.sin(xAngle * psi)
    };
}



// claude-generated, not yet reviewed, probably jank
function fullThing(z, phi, psi, c_val, d_val, twist, squoosh_x, squoosh_y) {
    const shifted = projectiveShift(z, phi, psi);
    const halfEbb = c.of(-c_val * 0.5, -d_val * 0.5);
    const mid = c.add(shifted, halfEbb);
    const mids = c.of(mid.re / squoosh_x, mid.im / squoosh_y);

    const cosTwist = Math.cos(twist);
    const sinTwist = Math.sin(twist);
    const rotated = c.of(
        mids.re * cosTwist - mids.im * sinTwist,
        mids.re * sinTwist + mids.im * cosTwist
    );

    return c.add(rotated, halfEbb);
}


export function translatedProjectiveShift(z, t, phi=0, psi=1) {
    const shifted = projectiveShift(z, phi, psi);
    return c.sub(shifted, t);
}


