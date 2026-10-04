/* canonical — the n-ary canonical forms. surface syntax never produces
these; canonicalize flattens additive and multiplicative chains into
them, and codegen re-nests them for rendering. they define their own
derivatives, so differentiate composes with canonicalize. their
evaluation derives from the family's binary operation at the value
level: sum folds through plus, product through multiply, and
pointwiseProduct — the Hadamard family's form over vectors — through
pointwiseMultiply. */

import { valueApply } from "../types/index.js";
import { arithmetic } from "./arithmetic.js";
import { products } from "./products.js";
import { define } from "./helpers.js";

export const canonical = define({
    sum: {
        structural: true,
        derivative: (args, derivatives, builders) =>
            builders.apply("sum", ...derivatives),
        mathClass: "additive",
        canonical: "sum",
        terms: "expand",
        expand: "sum",
        cases: [
            {
                variadic: true,
                arguments: "same",
                evaluate: (...args) =>
                    args.reduce((a, b) => valueApply(arithmetic.plus, a, b)),
            },
        ],
    },

    product: {
        structural: true,
        derivative: (args, derivatives, builders) =>
            builders.apply(
                "sum",
                ...args.map((factor, differentiated) =>
                    builders.apply(
                        "product",
                        ...args.map((other, i) =>
                            i === differentiated ? derivatives[differentiated] : other
                        )
                    )
                )
            ),
        mathClass: "multiplicative",
        canonical: "product",
        factors: "expand",
        expand: "product",
        cases: [
            {
                variadic: true,
                arguments: "same",
                evaluate: (...args) =>
                    args.reduce((a, b) => valueApply(products.multiply, a, b)),
            },
        ],
    },

    pointwiseProduct: {
        structural: true,
        derivative: (args, derivatives, builders) =>
            builders.apply(
                "sum",
                ...args.map((factor, differentiated) =>
                    builders.apply(
                        "pointwiseProduct",
                        ...args.map((other, i) =>
                            i === differentiated ? derivatives[differentiated] : other
                        )
                    )
                )
            ),
        mathClass: "multiplicative",
        canonical: "product",
        factors: "expand",
        expand: "pointwiseProduct",
        cases: [
            {
                variadic: true,
                arguments: "same",
                evaluate: (...args) =>
                    args.reduce((a, b) => valueApply(products.pointwiseMultiply, a, b)),
            },
        ],
    },
});
