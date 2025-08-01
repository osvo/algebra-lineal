// app/LinearTransformationVisualizer.jsx
// Visualizador de transformaciones lineales en 1D, 2D y 3D.
// Requiere que Plotly esté disponible como global (añadido en index.html).
// No usa imports ES6 para encajar con Babel 6 / webpack 1 del repo.

(function () {

  // ---------- Utilidades de álgebra ----------
  function I(n) { const M = []; for (let i=0;i<n;i++){ M[i]=[]; for(let j=0;j<n;j++){ M[i][j]=(i===j)?1:0; } } return M; }
  function add(A,B){ return A.map((r,i)=>r.map((v,j)=>v + B[i][j])); }
  function scale(A,s){ return A.map(r=>r.map(v=>s*v)); }
  function mul(A,B){
    const n=A.length, m=B[0].length, k=B.length;
    const C = Array.from({length:n},()=>Array(m).fill(0));
    for(let i=0;i<n;i++) for(let j=0;j<m;j++) for(let t=0;t<k;t++) C[i][j]+=A[i][t]*B[t][j];
    return C;
  }
  function mv(A,v){ return A.map(row => row.reduce((s,a_k,k)=>s + a_k*v[k],0)); }
  function det2(M){ return M[0][0]*M[1][1] - M[0][1]*M[1][0]; }
  function det3(M){
    const a=M[0][0], b=M[0][1], c=M[0][2];
    const d=M[1][0], e=M[1][1], f=M[1][2];
    const g=M[2][0], h=M[2][1], k=M[2][2];
    return a*(e*k - f*h) - b*(d*k - f*g) + c*(d*h - e*g);
  }
  function round(x){ return Math.round(x*1000)/1000; }

  // ---------- Componentes auxiliares ----------
  function NumericInput({ value, onChange, step=0.1 }) {
    return React.createElement('input', {
      type: 'number', step, value,
      onChange: e => onChange(parseFloat(e.target.value)),
      style: { width: '6em', marginRight: '0.5rem' }
    });
  }

  function MatrixEditor({ dim, label, value, onChange }) {
    const rows = [];
    for (let i=0;i<dim;i++){
      const cells = [];
      for (let j=0;j<dim;j++){
        cells.push(React.createElement(NumericInput, {
          key:`${i}-${j}`, value: value[i][j],
          onChange: (val)=>{
            const M = value.map(r=>r.slice());
            M[i][j] = isFinite(val)? val : 0;
            onChange(M);
          }
        }));
      }
      rows.push(React.createElement('div', { key:i, style:{ marginBottom:'0.3rem' } }, cells));
    }
    return React.createElement('div', { style:{ marginBottom:'0.8rem' } }, [
      React.createElement('div', { key:'lbl', style:{ fontWeight:'bold', marginBottom:'0.3rem' } }, label),
      rows
    ]);
  }

  function VectorEditor({ dim, label, value, onChange }) {
    const cells = [];
    for (let i=0;i<dim;i++){
      cells.push(React.createElement(NumericInput, {
        key:i, value: value[i],
        onChange:(val)=>{
          const v = value.slice();
          v[i] = isFinite(val)? val : 0;
          onChange(v);
        }
      }));
    }
    return React.createElement('div', { style:{ marginBottom:'0.8rem' } }, [
      React.createElement('div', { key:'lbl', style:{ fontWeight:'bold', marginBottom:'0.3rem' } }, label),
      React.createElement('div', { key:'inputs' }, cells)
    ]);
  }

  // ---------- Visualizador principal ----------
  class LinearTransformationVisualizer extends React.Component {
    constructor(props){
      super(props);
      this.state = {
        dim: 2,
        matrixA: [[1,0],[0,1]],
        matrixB: [[1,0],[0,1]],
        useExtraMatrix: false,
        vector: [1,1],
        t: 0.0,
        playing: false
      };
      this.plotRef = React.createRef();
      this.tick = this.tick.bind(this);
    }

    componentDidMount(){ this.drawPlot(); }
    componentDidUpdate(){ this.drawPlot(); }
    componentWillUnmount(){ if (this._timer) clearInterval(this._timer); }

    setDim(dim){
      const n = parseInt(dim,10);
      const I_n = I(n);
      const v = Array.from({length:n}, (_,i)=> (i===0?1:0));
      this.setState({
        dim:n, matrixA:I_n, matrixB:I_n, vector:v, t:0
      });
    }

    effectiveMatrix(){
      const { dim, matrixA, matrixB, useExtraMatrix } = this.state;
      const I_n = I(dim);
      const M = useExtraMatrix ? mul(matrixB, matrixA) : matrixA; // composición B·A
      return { I_n, M };
    }

    M_t(){
      const { I_n, M } = this.effectiveMatrix();
      const { t } = this.state;
      // (1−t)I + tM
      return add( scale(I_n, 1 - t), scale(M, t) );
    }

    tick(){
      this.setState(prev=>{
        let nt = prev.t + 0.02;
        if (nt > 1) { nt = 1; if (this._timer) { clearInterval(this._timer); return { t: nt, playing:false }; } }
        return { t: nt };
      });
    }

    drawPlot(){
      const el = this.plotRef.current;
      if (!el || !window.Plotly) return;

      const { dim, vector } = this.state;
      const M_t = this.M_t();

      if (dim === 1) {
        // Ejes
        const x = [-3, 3], y = [0,0];
        // Base transformada e imagen de vector
        const e1 = [1], e1_t = mv(M_t, e1);
        const v_t = mv(M_t, vector);

        const traces = [
          { x, y, mode:'lines', name:'Eje', showlegend:false },
          { x:[0,1], y:[0,0], mode:'lines+markers', name:'e1', showlegend:true },
          { x:[0,e1_t[0]], y:[0,0], mode:'lines+markers', name:'M(t)e1' , showlegend:true },
          { x:[0,vector[0]], y:[0,0], mode:'lines+markers', name:'v', showlegend:true },
          { x:[0,v_t[0]], y:[0,0], mode:'lines+markers', name:'M(t)v', showlegend:true }
        ];
        const layout = { width: 680, height: 470, margin:{l:40,r:10,b:40,t:10}, xaxis:{range:[-3,3]}, yaxis:{range:[-1,1]}, showlegend:true };
        Plotly.react(el, traces, layout, {displayModeBar:false});
      }

      if (dim === 2) {
        const L = 3;
        const grid = [
          { x:[-L, L], y:[0,0], mode:'lines', name:'x', line:{dash:'dot'}, showlegend:false },
          { x:[0,0], y:[-L, L], mode:'lines', name:'y', line:{dash:'dot'}, showlegend:false }
        ];
        const e1 = [1,0], e2 = [0,1];
        const e1t = mv(M_t, e1), e2t = mv(M_t, e2);
        const v_t = mv(M_t, vector);

        const traces = [
          ...grid,
          { x:[0,e1[0]], y:[0,e1[1]], mode:'lines+markers', name:'e1' },
          { x:[0,e2[0]], y:[0,e2[1]], mode:'lines+markers', name:'e2' },
          { x:[0,e1t[0]], y:[0,e1t[1]], mode:'lines+markers', name:'M(t)e1' },
          { x:[0,e2t[0]], y:[0,e2t[1]], mode:'lines+markers', name:'M(t)e2' },
          { x:[0,vector[0]], y:[0,vector[1]], mode:'lines+markers', name:'v' },
          { x:[0,v_t[0]], y:[0,v_t[1]], mode:'lines+markers', name:'M(t)v' }
        ];
        const layout = { width: 680, height: 470, margin:{l:40,r:10,b:40,t:10}, xaxis:{range:[-L,L], scaleanchor:'y'}, yaxis:{range:[-L,L]}, showlegend:true };
        Plotly.react(el, traces, layout, {displayModeBar:false});
      }

      if (dim === 3) {
        const L = 2.5;
        const line3 = (p,q,name)=>({ type:'scatter3d', mode:'lines+markers', x:[p[0],q[0]], y:[p[1],q[1]], z:[p[2],q[2]], name });

        const e1=[1,0,0], e2=[0,1,0], e3=[0,0,1];
        const e1t = mv(M_t,e1), e2t = mv(M_t,e2), e3t = mv(M_t,e3);
        const v_t  = mv(M_t, this.state.vector);

        const traces = [
          line3([0,0,0],[L,0,0],'x'),
          line3([0,0,0],[0,L,0],'y'),
          line3([0,0,0],[0,0,L],'z'),
          line3([0,0,0],e1t,'M(t)e1'),
          line3([0,0,0],e2t,'M(t)e2'),
          line3([0,0,0],e3t,'M(t)e3'),
          line3([0,0,0],this.state.vector,'v'),
          line3([0,0,0],v_t,'M(t)v'),
        ];
        const layout = { width: 760, height: 520, margin:{l:0,r:0,b:0,t:0},
          scene:{ xaxis:{range:[-L,L]}, yaxis:{range:[-L,L]}, zaxis:{range:[-L,L]} },
          showlegend:true
        };
        Plotly.react(el, traces, layout, {displayModeBar:false});
      }
    }

    render(){
      const { dim, matrixA, matrixB, useExtraMatrix, vector, t, playing } = this.state;

      const det = (dim===1) ? matrixA[0][0]
                : (dim===2) ? det2(matrixA)
                : det3(matrixA);

      const { M } = this.effectiveMatrix();

      return React.createElement('div', { style:{ fontFamily:'system-ui, sans-serif', color:'#111', maxWidth:'980px' } }, [

        // Controles
        React.createElement('div', { key:'controls', style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' } }, [

          // Panel izquierdo
          React.createElement('div', { key:'left' }, [
            React.createElement('div', { key:'hdr', style:{ fontSize:'1.1rem', fontWeight:'bold', marginBottom:'0.5rem' } }, 'Parámetros'),

            React.createElement('div', { key:'dim' }, [
              React.createElement('label', { style:{ marginRight:'0.5rem' } }, 'Dimensión:'),
              React.createElement('select', {
                value: dim,
                onChange: e => this.setDim(e.target.value)
              }, [
                React.createElement('option', { key:1, value:1 }, '1D'),
                React.createElement('option', { key:2, value:2 }, '2D'),
                React.createElement('option', { key:3, value:3 }, '3D')
              ])
            ]),

            React.createElement(MatrixEditor, {
              key:'A',
              dim,
              label:'Matriz A',
              value: matrixA,
              onChange: m => this.setState({ matrixA: m })
            }),

            React.createElement('label', { key:'chkLbl', style:{ display:'block', margin:'0.4rem 0' } }, [
              React.createElement('input', {
                key:'chk', type:'checkbox', checked: useExtraMatrix,
                onChange: e => this.setState({ useExtraMatrix: e.target.checked })
              }),
              ' Componer con matriz B (usa B·A)'
            ]),

            useExtraMatrix && React.createElement(MatrixEditor, {
              key:'B',
              dim,
              label:'Matriz B',
              value: matrixB,
              onChange: m => this.setState({ matrixB: m })
            }),

            React.createElement(VectorEditor, {
              key:'v',
              dim,
              label:'Vector v',
              value: vector,
              onChange: v => this.setState({ vector: v })
            }),

            React.createElement('div', { key:'t', style:{ marginTop:'0.5rem' } }, [
              React.createElement('label', { style:{ marginRight:'0.5rem' } }, `t: ${round(t)}`),
              React.createElement('input', {
                type:'range', min:0, max:1, step:0.01, value:t,
                onChange: e => this.setState({ t: parseFloat(e.target.value) })
              }),
              React.createElement('button', {
                style:{ marginLeft:'0.75rem' },
                onClick: ()=>{
                  if (!this._timer){
                    this.setState({ playing:true, t:0 });
                    this._timer = setInterval(this.tick, 30);
                  }
                },
                disabled: playing
              }, 'Play')
            ]),

            React.createElement('div', { key:'info', style:{ marginTop:'0.6rem', fontSize:'0.95rem' } },
              `det(A) = ${round(det)}; usando ${(this.state.useExtraMatrix?'B·A':'A')} con interpolación (1−t)I + t·M`
            )
          ]),

          // Panel derecho: gráfico
          React.createElement('div', { key:'right' },
            React.createElement('div', { ref:this.plotRef })
          )
        ]),

        // Pequeño resumen de la matriz efectiva
        React.createElement('div', { key:'Mx', style:{ fontSize:'0.95rem', marginTop:'0.5rem' } },
          'M = ' + JSON.stringify(M.map(row=>row.map(round)))
        )
      ]);
    }
  }

  // Exponer global para ser usado por index.jsx
  window.LinearTransformationVisualizer = LinearTransformationVisualizer;

})();
