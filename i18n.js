(function () {
  const STORAGE_KEY = 'linear-lab-language';
  const savedLanguage = localStorage.getItem(STORAGE_KEY);
  const browserLanguage = (navigator.language || '').toLowerCase();
  const language = savedLanguage === 'es' || savedLanguage === 'en'
    ? savedLanguage
    : (browserLanguage.startsWith('es') ? 'es' : 'en');

  document.documentElement.lang = language;

  const spanishToEnglish = new Map(Object.entries({
    'Navegación principal': 'Main navigation',
    'Laboratorio lineal': 'Linear algebra lab',
    'Álgebra en movimiento': 'Algebra in motion',
    'Transformaciones 2D': '2D transformations',
    'Cambio de base': 'Change of basis',
    'Composición': 'Composition',
    'Transformaciones 3D': '3D transformations',
    'Matrices no cuadradas': 'Non-square matrices',
    'Transformaciones no lineales': 'Nonlinear transformations',
    'Todos los módulos': 'All modules',
    '← Inicio': '← Home',
    'Visualizador de transformaciones lineales en dos dimensiones': '2D linear transformation visualizer',
    'Visualizador de Cambio de Base': 'Change of basis visualizer',
    'Visualizador de Composición de Transformaciones': 'Transformation composition visualizer',
    'Visualizador de transformaciones no-lineales en dos dimensiones': '2D nonlinear transformation visualizer',
    'Transformaciones lineales en tres dimensiones': 'Linear transformations in three dimensions',
    'Visualizador de transformaciones con matrices no cuadradas': 'Non-square matrix transformation visualizer',
    'Velocidad:': 'Speed:',
    'Usar vector arbitrario': 'Use arbitrary vector',
    'Mostrar vector arbitrario': 'Show arbitrary vector',
    'Mostrar Determinante': 'Show determinant',
    'Mostrar Vectores Propios': 'Show eigenvectors',
    'Mostrar Kernel': 'Show kernel',
    'Rango(': 'Rank(',
    'Nulidad(': 'Nullity(',
    'Rango =': 'Rank =',
    'Nulidad =': 'Nullity =',
    'Valores Propios (λ):': 'Eigenvalues (λ):',
    'Valores Propios (λ) y Vectores Propios (v⃗):': 'Eigenvalues (λ) and eigenvectors (v⃗):',
    'Vectores Propios:': 'Eigenvectors:',
    'Vectores Propios': 'Eigenvectors',
    'No calculados': 'Not calculated',
    'Inversa (': 'Inverse (',
    'No es invertible': 'Not invertible',
    'No se pudieron calcular.': 'Could not be calculated.',
    'No hay valores propios reales.': 'There are no real eigenvalues.',
    'Resetear Vectores': 'Reset vectors',
    'Resetear Vector': 'Reset vector',
    'Vector en base estándar': 'Vector in the standard basis',
    'Mismas coordenadas en la nueva base': 'Coordinates in the new basis',
    'Matriz de cambio de base (B → Estándar):': 'Change-of-basis matrix (B → Standard):',
    'Inversa (Estándar → B):': 'Inverse (Standard → B):',
    'La base no es válida (vectores LD)': 'The basis is invalid (linearly dependent vectors)',
    'Editar:': 'Edit:',
    'Orden de Aplicación:': 'Application order:',
    'Invertir Orden': 'Reverse order',
    'Seleccionar Transformación:': 'Select transformation:',
    'Desplazamiento': 'Translation',
    'Término Cuadrático': 'Quadratic term',
    'Onda Sinusoidal': 'Sine wave',
    'Cuadrado Complejo': 'Complex squaring',
    'Acoplamiento Sinusoidal': 'Sine coupling',
    'Torbellino': 'Swirl',
    'Valor Absoluto (Plegado)': 'Absolute value (fold)',
    'Producto de Componentes': 'Component product',
    'Modo de Visualización': 'Visualization mode',
    'Cubos (Octantes)': 'Cubes (octants)',
    'Nube de puntos': 'Point cloud',
    'Categoría': 'Category',
    'Transformación': 'Transformation',
    'Parámetros de la Transformación': 'Transformation parameters',
    'Ángulo:': 'Angle:',
    'Matriz de Transformación (': 'Transformation matrix (',
    'Matriz de Transformación (A)': 'Transformation matrix (A)',
    'Determinante': 'Determinant',
    'Personalizado': 'Custom',
    'Matriz Actual': 'Current matrix',
    'Básicas': 'Basic',
    'Matriz Identidad': 'Identity matrix',
    'Matriz Cero': 'Zero matrix',
    'Escalamiento Uniforme': 'Uniform scaling',
    'Escalamiento por Ejes': 'Axis scaling',
    'Proyecciones': 'Projections',
    'Sobre Plano XY': 'Onto the XY plane',
    'Sobre Plano XZ': 'Onto the XZ plane',
    'Sobre Plano YZ': 'Onto the YZ plane',
    'Sobre Eje X': 'Onto the X axis',
    'Sobre Eje Y': 'Onto the Y axis',
    'Sobre Eje Z': 'Onto the Z axis',
    'Proyección sobre Vector': 'Projection onto a vector',
    'Reflexiones': 'Reflections',
    'Respecto al Origen': 'Across the origin',
    'Respecto al Plano XY': 'Across the XY plane',
    'Respecto al Plano XZ': 'Across the XZ plane',
    'Respecto al Plano YZ': 'Across the YZ plane',
    'Reflexión sobre Plano': 'Reflection across a plane',
    'Rotaciones': 'Rotations',
    'Sobre Eje X (45°)': 'About the X axis (45°)',
    'Sobre Eje X (60°)': 'About the X axis (60°)',
    'Sobre Eje X (90°)': 'About the X axis (90°)',
    'Sobre Eje Y (45°)': 'About the Y axis (45°)',
    'Sobre Eje Y (60°)': 'About the Y axis (60°)',
    'Sobre Eje Y (90°)': 'About the Y axis (90°)',
    'Sobre Eje Z (45°)': 'About the Z axis (45°)',
    'Sobre Eje Z (60°)': 'About the Z axis (60°)',
    'Sobre Eje Z (90°)': 'About the Z axis (90°)',
    'Rotación sobre Eje': 'Rotation about an axis',
    'Cizallamientos': 'Shears',
    'en XY': 'in XY',
    'en YX': 'in YX',
    'en XZ': 'in XZ',
    'en ZX': 'in ZX',
    'en YZ': 'in YZ',
    'en ZY': 'in ZY',
    'Dimensiones': 'Dimensions',
    'Dominio': 'Domain',
    'Codominio': 'Codomain',
    'Usar Vector Arbitrario': 'Use arbitrary vector',
    'Espacio Columna (Im(': 'Column space (Im(',
    'Espacio Nulo (Ker(': 'Null space (Ker(',
    'Solo el origen {0}.': 'Only the origin {0}.',
    'El origen {0}.': 'The origin {0}.',
    '(Orientación Invertida)': '(Orientation reversed)'
  }));

  const dynamicReplacements = [
    [/^Un subespacio de (.+) de dimensión (\d+)\.$/, 'A subspace of $1 of dimension $2.'],
    [/^Todo el espacio (.+)\.$/, 'The entire space $1.'],
    [/^Todo el espacio de entrada (.+)\.$/, 'The entire input space $1.']
  ];

  function t(english, spanish) {
    return language === 'es' ? spanish : english;
  }

  function translateString(value) {
    if (language !== 'en' || !value) return value;
    if (spanishToEnglish.has(value)) return spanishToEnglish.get(value);
    for (const [pattern, replacement] of dynamicReplacements) {
      if (pattern.test(value)) return value.replace(pattern, replacement);
    }
    return value;
  }

  function translateTextNode(node) {
    if (language !== 'en' || !node.nodeValue) return;
    const match = node.nodeValue.match(/^(\s*)(.*?)(\s*)$/s);
    if (!match || !match[2]) return;
    const translated = translateString(match[2]);
    if (translated !== match[2]) {
      node.nodeValue = `${match[1]}${translated}${match[3]}`;
    }
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;

    if (element.dataset.en && element.dataset.es) {
      const value = language === 'es' ? element.dataset.es : element.dataset.en;
      if (element.tagName === 'META') {
        element.setAttribute('content', value);
      } else if (element.hasAttribute('data-i18n-html')) {
        element.innerHTML = value;
      } else {
        element.textContent = value;
      }
    }

    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      if (element.hasAttribute(attribute)) {
        const value = element.getAttribute(attribute);
        const translated = translateString(value);
        if (translated !== value) element.setAttribute(attribute, translated);
      }
    }
  }

  function apply(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }

    if (!(root instanceof Element) && root !== document) return;
    if (root instanceof Element) translateElement(root);

    const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const element of elements) translateElement(element);

    if (language === 'en') {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const tag = node.parentElement && node.parentElement.tagName;
            return ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(tag)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) translateTextNode(node);
    }
  }

  function addLanguageSwitch() {
    const navLinks = document.querySelector('.site-nav__links');
    if (!navLinks || navLinks.querySelector('.lang-switch')) return;

    const switcher = document.createElement('div');
    switcher.className = 'lang-switch';
    switcher.setAttribute('aria-label', t('Language', 'Idioma'));
    switcher.innerHTML = `
      <button type="button" data-language="en" aria-pressed="${language === 'en'}">EN</button>
      <span aria-hidden="true">/</span>
      <button type="button" data-language="es" aria-pressed="${language === 'es'}">ES</button>
    `;
    switcher.addEventListener('click', (event) => {
      const button = event.target.closest('[data-language]');
      if (!button || button.dataset.language === language) return;
      localStorage.setItem(STORAGE_KEY, button.dataset.language);
      window.location.reload();
    });
    navLinks.appendChild(switcher);
  }

  function addLabFooter() {
    if (!document.body.classList.contains('lab-page') || document.querySelector('.lab-footer')) return;
    const footer = document.createElement('footer');
    footer.className = 'lab-footer';
    footer.innerHTML = `
      <div class="lab-footer__inner">
        <span data-en="Independent project by Juan Camilo Osorio Oviedo." data-es="Proyecto independiente de Juan Camilo Osorio Oviedo.">Independent project by Juan Camilo Osorio Oviedo.</span>
        <a href="https://www.3blue1brown.com/" target="_blank" rel="noreferrer" data-en="Inspired by the visual mathematics of 3Blue1Brown ↗" data-es="Inspirado en las matemáticas visuales de 3Blue1Brown ↗">Inspired by the visual mathematics of 3Blue1Brown ↗</a>
      </div>
    `;
    document.body.appendChild(footer);
  }

  function initialize() {
    const body = document.body;
    if (body && body.dataset.titleEn && body.dataset.titleEs) {
      document.title = t(body.dataset.titleEn, body.dataset.titleEs);
    } else {
      document.title = translateString(document.title);
    }

    addLanguageSwitch();
    addLabFooter();
    apply(document);

    if (language === 'en') {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') {
            translateTextNode(mutation.target);
          }
          for (const node of mutation.addedNodes) apply(node);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  window.LabI18n = { language, t, apply, translateString };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
