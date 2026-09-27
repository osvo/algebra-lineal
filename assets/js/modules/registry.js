// Learning path: every module of the laboratory, in suggested order.

export const CHAPTERS = [
  { id: 'transform', title: { es: 'Transformaciones', en: 'Transformations' } },
  { id: 'systems', title: { es: 'Sistemas y subespacios', en: 'Systems and subspaces' } },
  { id: 'spectral', title: { es: 'Coordenadas y espectro', en: 'Coordinates and spectrum' } },
  { id: 'geometry', title: { es: 'Geometría euclídea', en: 'Euclidean geometry' } },
  { id: 'beyond', title: { es: 'Más allá de lo lineal', en: 'Beyond linearity' } },
];

export const MODULES = [
  {
    id: 't2d', file: 'transformaciones_2D.html', chapter: 'transform',
    title: { es: 'Transformaciones 2D', en: '2D transformations' },
    tag: { es: 'Fundamento', en: 'Foundation' },
    blurb: {
      es: 'Deforma el plano con una matriz 2 × 2: determinante, vectores propios, núcleo, imagen e inversa.',
      en: 'Deform the plane with a 2 × 2 matrix: determinant, eigenvectors, kernel, image and inverse.',
    },
  },
  {
    id: 'comp', file: 'composiciones.html', chapter: 'transform',
    title: { es: 'Composición', en: 'Composition' },
    tag: { es: 'Orden', en: 'Order' },
    blurb: {
      es: 'Encadena dos transformaciones, invierte el orden y comprueba por qué el producto de matrices no conmuta.',
      en: 'Chain two transformations, swap their order and see why matrix multiplication does not commute.',
    },
  },
  {
    id: 't3d', file: 'transformaciones_3D.html', chapter: 'transform',
    title: { es: 'Transformaciones 3D', en: '3D transformations' },
    tag: { es: 'Espacio', en: 'Space' },
    blurb: {
      es: 'Rota, proyecta, refleja y cizalla el espacio; volumen, rango y ejes invariantes.',
      en: 'Rotate, project, reflect and shear space; volume, rank and invariant axes.',
    },
  },
  {
    id: 'sys', file: 'sistemas_lineales.html', chapter: 'systems', isNew: true,
    title: { es: 'Sistemas Ax = b', en: 'Systems Ax = b' },
    tag: { es: 'Eliminación', en: 'Elimination' },
    blurb: {
      es: 'Rectas y planos que se cortan, columnas que se combinan y eliminación gaussiana paso a paso.',
      en: 'Intersecting lines and planes, combining columns, and Gaussian elimination step by step.',
    },
  },
  {
    id: 'nsq', file: 'matrices_no_cuadradas.html', chapter: 'systems',
    title: { es: 'Matrices no cuadradas', en: 'Non-square matrices' },
    tag: { es: 'Dimensión', en: 'Dimension' },
    blurb: {
      es: 'Transformaciones entre espacios de distinta dimensión: imagen, núcleo y el teorema del rango.',
      en: 'Maps between spaces of different dimension: image, kernel and the rank–nullity theorem.',
    },
  },
  {
    id: 'cob', file: 'cambio_de_base.html', chapter: 'spectral',
    title: { es: 'Cambio de base', en: 'Change of basis' },
    tag: { es: 'Coordenadas', en: 'Coordinates' },
    blurb: {
      es: 'El mismo vector en dos sistemas de coordenadas, y la misma transformación vista desde otra base.',
      en: 'The same vector in two coordinate systems, and the same map seen from another basis.',
    },
  },
  {
    id: 'eig', file: 'valores_propios.html', chapter: 'spectral', isNew: true,
    title: { es: 'Valores propios y dinámica', en: 'Eigenvalues and dynamics' },
    tag: { es: 'Espectro', en: 'Spectrum' },
    blurb: {
      es: 'Direcciones que no giran, iteraciones xₖ₊₁ = A xₖ, diagonalización y rotación-escalado.',
      en: 'Directions that do not turn, iterations xₖ₊₁ = A xₖ, diagonalization and rotation-scaling.',
    },
  },
  {
    id: 'orth', file: 'ortogonalidad.html', chapter: 'geometry', isNew: true,
    title: { es: 'Ortogonalidad', en: 'Orthogonality' },
    tag: { es: 'Proyección', en: 'Projection' },
    blurb: {
      es: 'Producto punto y proyecciones, Gram–Schmidt y mínimos cuadrados como proyección.',
      en: 'Dot product and projections, Gram–Schmidt, and least squares as a projection.',
    },
  },
  {
    id: 'svd', file: 'svd.html', chapter: 'geometry', isNew: true,
    title: { es: 'Descomposición en valores singulares', en: 'Singular value decomposition' },
    short: { es: 'SVD', en: 'SVD' },
    tag: { es: 'Factorización', en: 'Factorization' },
    blurb: {
      es: 'Toda matriz lleva el círculo unitario a una elipse: A = UΣVᵀ como rotación, estiramiento y rotación.',
      en: 'Every matrix maps the unit circle to an ellipse: A = UΣVᵀ as rotate, stretch, rotate.',
    },
  },
  {
    id: 'nl', file: 'transformaciones_no_lineales.html', chapter: 'beyond',
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
