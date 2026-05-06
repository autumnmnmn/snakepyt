
export const sizes = {
    f32: 4, i32: 4, u32: 4,
    f16: 2, i16: 2, u16: 2
};

export const aligns = {
    vec3f: 16,
    vec3u: 16,
    vec2f: 8,
    vec2u: 8,
    f32: 4, i32: 4, u32: 4,
    f16: 2, i16: 2, u16: 2,
}

export const floatTypes = new Set(["f32", "f16"]);

export const setters = {
    f32: DataView.prototype.setFloat32,
    f16: DataView.prototype.setFloat16,
    i32: DataView.prototype.setInt32,
    i16: DataView.prototype.setInt16,
    u32: DataView.prototype.setUint32,
    u16: DataView.prototype.setUint16,
    i8: DataView.prototype.setInt8,
    u8: DataView.prototype.setUint8
};

export const compositeTypes = {
    vec2f: [
        { type: "f32", name: "x" },
        { type: "f32", name: "y" }
    ],
    vec2u: [
        { type: "u32", name: "x" },
        { type: "u32", name: "y" }
    ],
    vec3u: [
        { type: "u32", name: "x" },
        { type: "u32", name: "y" },
        { type: "u32", name: "z" }
    ],
    vec3f: [
        { type: "f32", name: "x" },
        { type: "f32", name: "y" },
        { type: "f32", name: "z" }
    ],
};

