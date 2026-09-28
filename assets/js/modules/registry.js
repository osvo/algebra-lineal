// Learning path: every module of the laboratory, in suggested order.

export const CHAPTERS = [
  { id: 'transform', title: { es: 'Vectores y transformaciones', en: 'Vectors and transformations' } },
  { id: 'systems', title: { es: 'Sistemas y subespacios', en: 'Systems and subspaces' } },
  { id: 'spectral', title: { es: 'Coordenadas y espectro', en: 'Coordinates and spectrum' } },
  { id: 'geometry', title: { es: 'Geometría euclídea', en: 'Euclidean geometry' } },
  { id: 'beyond', title: { es: 'Más allá de ℝⁿ y de lo lineal', en: 'Beyond ℝⁿ and linearity' } },
];

export const MODULES = [
  {
    id: 'span', file: 'combinaciones_lineales.html', chapter: 'transform', challenges: 4, isNew: true,
    title: { es: 'Combinaciones lineales', en: 'Linear combinations' },
    tag: { es: 'Generado', en: 'Span' },
    blurb: {
      es: 'Escala y suma flechas: generado, independencia lineal, bases y dimensión en ℝ² y ℝ³, con ecuaciones exactas.',
      en: 'Scale and add arrows: span, linear independence, bases and dimension in ℝ² and ℝ³, with exact equations.',
    },
  },
  {
    id: 't2d', file: 'transformaciones_2D.html', chapter: 'transform', challenges: 5,
    title: { es: 'Transformaciones 2D', en: '2D transformations' },
    tag: { es: 'Fundamento', en: 'Foundation' },
    blurb: {
      es: 'Deforma el plano con una matriz 2 × 2: determinante, vectores propios, núcleo, imagen e inversa.',
      en: 'Deform the plane with a 2 × 2 matrix: determinant, eigenvectors, kernel, image and inverse.',
    },
  },
  {
    id: 'comp', file: 'composiciones.html', chapter: 'transform', challenges: 4,
    title: { es: 'Composición', en: 'Composition' },
    tag: { es: 'Orden', en: 'Order' },
    blurb: {
      es: 'Encadena dos transformaciones, invierte el orden y comprueba por qué el producto de matrices no conmuta.',
      en: 'Chain two transformations, swap their order and see why matrix multiplication does not commute.',
    },
  },
  {
    id: 't3d', file: 'transformaciones_3D.html', chapter: 'transform', challenges: 5,
    title: { es: 'Transformaciones 3D', en: '3D transformations' },
    tag: { es: 'Espacio', en: 'Space' },
    blurb: {
      es: 'Rota, proyecta, refleja y cizalla el espacio; volumen, rango y ejes invariantes.',
      en: 'Rotate, project, reflect and shear space; volume, rank and invariant axes.',
    },
  },
  {
    id: 'det', file: 'determinantes.html', chapter: 'transform', challenges: 4, isNew: true,
    title: { es: 'Determinantes', en: 'Determinants' },
    tag: { es: 'Área y volumen', en: 'Area and volume' },
    blurb: {
      es: 'Área y volumen con signo, operaciones de columna animadas, regla de Cramer geométrica y desarrollo por cofactores.',
      en: 'Signed area and volume, animated column operations, geometric Cramer’s rule and cofactor expansion.',
    },
  },
  {
    id: 'sys', file: 'sistemas_lineales.html', chapter: 'systems', challenges: 5,
    title: { es: 'Sistemas Ax = b', en: 'Systems Ax = b' },
    tag: { es: 'Eliminación', en: 'Elimination' },
    blurb: {
      es: 'Rectas y planos que se cortan, columnas que se combinan, eliminación gaussiana paso a paso, inversa con [A | I] y LU.',
      en: 'Intersecting lines and planes, combining columns, Gaussian elimination step by step, the inverse via [A | I] and LU.',
    },
  },
  {
    id: 'nsq', file: 'matrices_no_cuadradas.html', chapter: 'systems', challenges: 4,
    title: { es: 'Matrices no cuadradas', en: 'Non-square matrices' },
    tag: { es: 'Dimensión', en: 'Dimension' },
    blurb: {
      es: 'Transformaciones entre espacios de distinta dimensión: los cuatro subespacios fundamentales y el teorema del rango.',
      en: 'Maps between spaces of different dimension: the four fundamental subspaces and the rank–nullity theorem.',
    },
  },
  {
    id: 'cob', file: 'cambio_de_base.html', chapter: 'spectral', challenges: 4,
    title: { es: 'Cambio de base', en: 'Change of basis' },
    tag: { es: 'Coordenadas', en: 'Coordinates' },
    blurb: {
      es: 'El mismo vector en dos sistemas de coordenadas, y la misma transformación vista desde otra base.',
      en: 'The same vector in two coordinate systems, and the same map seen from another basis.',
    },
  },
  {
    id: 'eig', file: 'valores_propios.html', chapter: 'spectral', challenges: 4,
    title: { es: 'Valores propios y dinámica', en: 'Eigenvalues and dynamics' },
    tag: { es: 'Espectro', en: 'Spectrum' },
    blurb: {
      es: 'Direcciones que no giran, iteraciones xₖ₊₁ = A xₖ, flujos x′ = Ax, diagonalización y rotación-escalado.',
      en: 'Directions that do not turn, iterations xₖ₊₁ = A xₖ, flows x′ = Ax, diagonalization and rotation-scaling.',
    },
  },
  {
    id: 'orth', file: 'ortogonalidad.html', chapter: 'geometry', challenges: 5,
    title: { es: 'Ortogonalidad', en: 'Orthogonality' },
    tag: { es: 'Proyección', en: 'Projection' },
    blurb: {
      es: 'Producto punto y proyecciones, Gram–Schmidt, mínimos cuadrados como proyección y producto cruz.',
      en: 'Dot product and projections, Gram–Schmidt, least squares as a projection, and the cross product.',
    },
  },
  {
    id: 'quad', file: 'formas_cuadraticas.html', chapter: 'geometry', challenges: 4, isNew: true,
    title: { es: 'Formas cuadráticas', en: 'Quadratic forms' },
    tag: { es: 'Teorema espectral', en: 'Spectral theorem' },
    blurb: {
      es: 'Cónicas como curvas de nivel de xᵀAx, ejes principales ortogonales, definida positiva y cociente de Rayleigh.',
      en: 'Conics as level curves of xᵀAx, orthogonal principal axes, positive definiteness and the Rayleigh quotient.',
    },
  },
  {
    id: 'svd', file: 'svd.html', chapter: 'geometry', challenges: 5,
    title: { es: 'Descomposición en valores singulares', en: 'Singular value decomposition' },
    short: { es: 'SVD', en: 'SVD' },
    tag: { es: 'Factorización', en: 'Factorization' },
    blurb: {
      es: 'Toda matriz lleva el círculo (o la esfera) unidad a una elipse (o un elipsoide): A = UΣVᵀ como rotación, estiramiento y rotación.',
      en: 'Every matrix maps the unit circle (or sphere) to an ellipse (or ellipsoid): A = UΣVᵀ as rotate, stretch, rotate.',
    },
  },
  {
    id: 'poly', file: 'polinomios.html', chapter: 'beyond', challenges: 4, isNew: true,
    title: { es: 'Espacios de polinomios', en: 'Polynomial spaces' },
    tag: { es: 'Abstracción', en: 'Abstraction' },
    blurb: {
      es: 'Polinomios como vectores: coordenadas en varias bases, la derivada como matriz e interpolación con Vandermonde.',
      en: 'Polynomials as vectors: coordinates in several bases, the derivative as a matrix and interpolation with Vandermonde.',
    },
  },
  {
    id: 'nl', file: 'transformaciones_no_lineales.html', chapter: 'beyond', challenges: 4,
    title: { es: 'Transformaciones no lineales', en: 'Nonlinear transformations' },
    tag: { es: 'Contraste', en: 'Contrast' },
    blurb: {
      es: 'Curvas, pliegues y remolinos; pruebas de linealidad y la jacobiana como aproximación lineal local.',
      en: 'Bends, folds and swirls; linearity tests and the Jacobian as a local linear approximation.',
    },
  },
];

export const moduleIndex = (id) => MODULES.findIndex((m) => m.id === id);
export const moduleNumber = (id) => String(moduleIndex(id) + 1).padStart(2, '0');
export const chapterOf = (m) => CHAPTERS.find((c) => c.id === m.chapter);
