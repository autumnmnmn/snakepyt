
let receivers: any = {};

let transmitters: any = {};

interface NodeInput {
    schemas: string[];

}

interface Card {
    width: number;
    height: number;
    left: number;
    top: number;
    input_schemas: string[][];
    output_schemas: string[][];
}




export { receivers, transmitters };
