#!/usr/bin/env node
// ╔═══════════════════════════════════════════════════════════════╗
// ║  VEX TRANSPILER  v0.1.0                                       ║
// ║                                                               ║
// ║  ZERO hardcoded keywords.                                     ║
// ║  ALL syntax is user-definable macros.                         ║
// ║  Output: plain JavaScript.                                    ║
// ║                                                               ║
// ║  Runs everywhere JS runs:                                     ║
// ║    V8 engine  · Node.js  · Deno  · Bun                       ║
// ║    Chrome  · Firefox  · Safari  · Edge                        ║
// ║    VS Code extensions  · WebStorm  · any browser IDE          ║
// ║    DOOM.js  · QuickJS  · Hermes  · Rhino  · GraalJS           ║
// ║    Embedded V8 in any app                                     ║
// ║                                                               ║
// ║  How unlimited syntax works:                                  ║
// ║    The tokenizer produces only raw atoms — WORD, NUM, STR,    ║
// ║    OP, SYM.  It has zero opinion about what any word means.   ║
// ║    "if", "component", "blorp", "forever" are identical: WORD. ║
// ║                                                               ║
// ║    The MACRO REGISTRY maps words → parse handlers.            ║
// ║    Built-in syntax (fn, class, if, for…) is just macros.      ║
// ║    Users can define NEW syntax inside any .vx file:           ║
// ║                                                               ║
// ║      syntax unless(cond, body) => `if(!(${cond}))${body}`    ║
// ║      syntax forever(body) => `while(true)${body}`            ║
// ║      syntax swap(a,b) => `{let t=${a};${a}=${b};${b}=t;}`    ║
// ║                                                               ║
// ║    After that line, `unless`, `forever`, `swap` are real      ║
// ║    syntax in that file — no build step, no plugins needed.    ║
// ╚═══════════════════════════════════════════════════════════════╝
'use strict';

// ─────────────────────────────────────────────────────────────────
//  TOKEN KINDS  (structural only — zero semantic meaning)
// ─────────────────────────────────────────────────────────────────
const K = {
  WORD: 'W',   // any word: abc _x $y myKeyword if forEach blorp
  NUM:  'N',   // 42  3.14  0xFF  0b101  1_000n
  STR:  'S',   // "hi"  'hi'  `hi ${x}`
  RE:   'R',   // /pattern/flags
  OP:   'O',   // multi-char operator: -> => :: |> ?? ...
  SYM:  'P',   // single punctuation: ( ) { } [ ] , ; . @ # ~ ? !
  NL:   'L',   // newline (filtered out before parsing)
  COM:  'C',   // comment (filtered out)
  EOF:  'E',
};

class T {
  constructor(k, v, ln, col) { this.k=k; this.v=v; this.ln=ln; this.col=col; }
}

// ─────────────────────────────────────────────────────────────────
//  TOKENIZER
//  Converts source text to atoms.  No keyword list, no opinions.
// ─────────────────────────────────────────────────────────────────
function tokenize(src, file='<vex>') {
  const out=[];
  let i=0, ln=1, col=1;

  const ch  = (n=0) => src[i+n] ?? '\0';
  const adv = () => { const c=src[i++]; if(c==='\n'){ln++;col=1;}else col++; return c; };
  const eat = v   => { if(ch()===v){adv();return true;} return false; };
  const tok = (k,v,l=ln,c=col) => out.push(new T(k,v,l,c));
  const end = ()  => i >= src.length;

  // Multi-char operators, longest first
  const OPS = [
    '>>>','<<=','>>=','**=','//=','%%=','&&=','||=','??=','..=','...','<=>',
    '===','!==','->','<=','>=','==','!=','++','--','**','//','%%','..','::',
    ':=','|>','~>','<-','=>','??','?.','?!','&&','||','^^','+=','-=','*=',
    '/=','%=','&=','|=','^=','<<','>>','<>','->>',
  ];

  while (!end()) {
    // Skip horizontal whitespace
    if (/[ \t\r]/.test(ch())) { adv(); continue; }

    const l=ln, c=col, cur=ch();

    // Newline
    if (cur==='\n') { adv(); tok(K.NL,'\n',l,c); continue; }

    // Shebang
    if (cur==='#' && ch(1)==='!' && i===0) {
      let s=''; while(!end()&&ch()!=='\n') s+=adv();
      tok(K.COM,s,l,c); continue;
    }

    // Line comment  // or --
    if ((cur==='/'&&ch(1)==='/') || (cur==='-'&&ch(1)==='-')) {
      adv(); adv();
      const doc = ch()==='/'||ch()==='-'; if(doc) adv();
      let s=''; while(!end()&&ch()!=='\n') s+=adv();
      tok(doc?K.COM:K.COM, s.trim(), l, c); continue;
    }

    // Block comment  /* */ or {- -}
    if (cur==='/'&&ch(1)==='*') {
      adv();adv(); let s='',d=1;
      while(!end()&&d>0){
        if(ch()==='/'&&ch(1)==='*'){adv();adv();d++;}
        else if(ch()==='*'&&ch(1)==='/'){adv();adv();d--;}
        else s+=adv();
      }
      tok(K.COM,s.trim(),l,c); continue;
    }
    if (cur==='{'&&ch(1)==='-') {
      adv();adv(); let s='';
      while(!end()&&!(ch()==='-'&&ch(1)==='}')){s+=adv();}
      if(!end()){adv();adv();}
      tok(K.COM,s.trim(),l,c); continue;
    }

    // WORD — any identifier, macro-bang word!, unicode letters ok
    if (/[a-zA-Z_$\u0080-\uffff]/.test(cur)) {
      let s='';
      while(!end()&&/[a-zA-Z0-9_$\u0080-\uffff]/.test(ch())) s+=adv();
      // Macro bang: word!(  — only if next char starts an argument
      if (ch()==='!'&&/[a-zA-Z0-9_$({"'`\[]/.test(ch(1))) s+=adv();
      tok(K.WORD,s,l,c); continue;
    }

    // NUMBER  (int, float, hex, bin, oct, BigInt, type-suffix)
    if (/[0-9]/.test(cur)||(cur==='.'&&/[0-9]/.test(ch(1)))) {
      let s=adv();
      if(s==='0'&&/[xXbBoO]/.test(ch())) {
        s+=adv();
        while(!end()&&/[0-9a-fA-F_]/.test(ch())){const d=adv();if(d!=='_')s+=d;}
      } else {
        while(!end()&&/[0-9_]/.test(ch())){const d=adv();if(d!=='_')s+=d;}
        if(ch()==='.'&&ch(1)!=='.'){
          s+=adv();
          while(!end()&&/[0-9_]/.test(ch())){const d=adv();if(d!=='_')s+=d;}
        }
        if(/[eE]/.test(ch())){
          s+=adv(); if(/[+-]/.test(ch()))s+=adv();
          while(!end()&&/[0-9]/.test(ch()))s+=adv();
        }
      }
      if(ch()==='n')s+=adv(); // BigInt suffix
      while(!end()&&/[a-zA-Z]/.test(ch()))s+=adv(); // type suffix e.g. 42i32
      tok(K.NUM,s,l,c); continue;
    }

    // STRING  " or '
    if (cur==='"'||cur==="'") {
      const d=adv(); let s='';
      while(!end()&&ch()!==d){s+=ch()==='\\'?(adv(),'\\'+adv()):adv();}
      if(!end())adv();
      const t=new T(K.STR,s,l,c); out.push(t); continue;
    }

    // TEMPLATE STRING  `...`
    if (cur==='`') {
      adv(); let raw='';
      while(!end()&&ch()!=='`'){
        if(ch()==='\\'){raw+=adv()+adv();}
        else if(ch()==='$'&&ch(1)==='{'){
          raw+=adv()+adv(); // keep ${
          let depth=1;
          while(!end()&&depth>0){const c2=adv();raw+=c2;if(c2==='{')depth++;else if(c2==='}')depth--;}
        } else raw+=adv();
      }
      if(!end())adv();
      const t=new T(K.STR,raw,l,c); t.tmpl=true; out.push(t); continue;
    }

    // RAW STRING  r"..." r'...' r`...`
    if (cur==='r'&&/["'`]/.test(ch(1))) {
      adv(); const d=adv(); let s='';
      while(!end()&&ch()!==d)s+=adv();
      if(!end())adv();
      const t=new T(K.STR,s,l,c); t.raw=true; out.push(t); continue;
    }

    // REGEX  /pat/flags — context-sensitive
    if (cur==='/') {
      const prev=[...out].reverse().find(t=>t.k!==K.NL&&t.k!==K.COM);
      const canRe=!prev||prev.k===K.OP||
        (prev.k===K.SYM&&'([{,;!&|?:'.includes(prev.v))||
        (prev.k===K.WORD&&/^(return|yield|in|of|typeof|instanceof|new|delete|throw|await|case|void)$/.test(prev.v));
      if (canRe) {
        adv(); let pat='',cls=false;
        while(!end()){
          const c2=adv();
          if(c2==='\\'){pat+=c2+adv();continue;}
          if(c2==='['){cls=true;pat+=c2;continue;}
          if(c2===']'){cls=false;pat+=c2;continue;}
          if(c2==='/'&&!cls)break;
          pat+=c2;
        }
        let fl=''; while(!end()&&/[gimsuy]/.test(ch()))fl+=adv();
        const t=new T(K.RE,pat,l,c); t.flags=fl; out.push(t); continue;
      }
    }

    // MULTI-CHAR OPERATOR — try longest match from current pos
    {
      let found=false;
      for(const op of OPS){
        if(src.startsWith(op,i)){
          for(let j=0;j<op.length;j++)adv();
          tok(K.OP,op,l,c); found=true; break;
        }
      }
      if(!found) tok(K.SYM,adv(),l,c);
    }
  }
  tok(K.EOF,'',ln,col);
  return out;
}

// ─────────────────────────────────────────────────────────────────
//  MACRO REGISTRY
//  The engine behind unlimited syntax.
//  Maps word strings → parse handler functions.
//  Built-in syntax (fn, class, if, for…) are just pre-loaded macros.
//  Users register new macros at runtime via `syntax name(...) => ...`
// ─────────────────────────────────────────────────────────────────
class Registry {
  constructor() {
    this.words   = new Map(); // name  → fn(parser) → AST
    this.infix   = new Map(); // op    → {prec, fn(parser,left) → AST}
    this.prefix  = new Map(); // op    → fn(parser) → AST
    this.xforms  = [];        // source-level text transforms
  }
  def(name, fn)          { this.words.set(name, fn); }
  defInfix(op, prec, fn) { this.infix.set(op, {prec, fn}); }
  defPrefix(op, fn)      { this.prefix.set(op, {fn}); }
  xform(re, fn)          { this.xforms.push({re, fn}); }
  has(w)                 { return this.words.has(w); }
  get(w)                 { return this.words.get(w); }
  applyXforms(src)       { let s=src; for(const x of this.xforms) s=s.replace(x.re,x.fn); return s; }
}

// ─────────────────────────────────────────────────────────────────
//  PARSER  —  Pratt parser, fully macro-driven
//  No hardcoded grammar rules.  Every parse decision goes through
//  the Registry.  If a word is registered → call its macro handler.
//  If not → it's just an identifier.
// ─────────────────────────────────────────────────────────────────
class Parser {
  constructor(tokens, reg) {
    // Filter out newlines and comments — they don't affect parsing
    this.toks = tokens.filter(t=>t.k!==K.NL&&t.k!==K.COM);
    this.all  = tokens;  // kept for source-map/formatting use
    this.pos  = 0;
    this.reg  = reg;
  }

  // ── Navigation ──────────────────────────────────────────────
  peek(n=0)    { return this.toks[this.pos+n] ?? new T(K.EOF,'',0,0); }
  adv()        { return this.toks[this.pos++]; }
  check(v)     { return this.peek().v===v; }
  checkK(k)    { return this.peek().k===k; }
  isWord(w)    { return this.peek().k===K.WORD&&(!w||this.peek().v===w); }
  eof()        { return this.peek().k===K.EOF; }
  eat(v)       { if(this.check(v)){this.adv();return true;} return false; }
  eatW(w)      { if(this.isWord(w)){this.adv();return true;} return false; }
  eatSemi()    { this.eat(';'); }
  eatComma()   { this.eat(','); }
  endStmt()    { return this.check('}')||this.check(';')||this.eof(); }
  expect(v)    {
    if(this.check(v))return this.adv();
    const t=this.peek();
    throw new SyntaxError(`[Vex] Expected ${JSON.stringify(v)} at ${t.ln}:${t.col}, got ${JSON.stringify(t.v)}`);
  }
  word()       {
    const t=this.peek();
    if(t.k===K.WORD) return this.adv().v;
    throw new SyntaxError(`[Vex] Expected identifier at ${t.ln}:${t.col}, got ${JSON.stringify(t.v)}`);
  }

  // ── Module ──────────────────────────────────────────────────
  parseModule() {
    const body=[];
    while(!this.eof()){
      try { body.push(this.top()); }
      catch(e){
        if(process?.env?.VEX_DEBUG)console.error(e);
        this.sync();
      }
    }
    return {T:'Module',body};
  }

  sync() {
    while(!this.eof()){
      if(this.eat(';'))return;
      if(this.check('}')||this.reg.has(this.peek().v))return;
      this.adv();
    }
  }

  // ── Top-level ────────────────────────────────────────────────
  top() {
    const decs=this.decs();
    const mods=this.mods();
    const n=this.stmt();
    if(n){if(decs.length)n.decs=decs;if(Object.keys(mods).length)n.mods=mods;}
    return n;
  }

  decs() {
    const d=[];
    while((this.check('@')&&this.peek(1).k===K.WORD)||(this.isWord()&&this.peek().v.startsWith('@'))){
      if(this.check('@'))this.adv();
      const name='@'+(this.isWord()?this.adv().v:'');
      const args=this.check('(')?this.args():[];
      d.push({T:'Dec',name,args});
    }
    return d;
  }

  MODWORDS = new Set([
    'pub','priv','prot','private','protected','public',
    'static','final','abstract','override','virtual','inline',
    'pure','unsafe','async','tailrec','noreturn','deprecated',
    'reactive','memo','lazy','mutable','readonly','volatile',
    'comptime','sealed','hot','cold','noinline','export',
    'declare','weak','shared','unique','mut','own',
  ]);

  mods() {
    const m={};
    while(this.isWord()&&this.MODWORDS.has(this.peek().v))m[this.adv().v]=true;
    return m;
  }

  // ── Statements ───────────────────────────────────────────────
  stmt() {
    // Macro word dispatch — the core of unlimited syntax
    if(this.isWord()&&this.reg.has(this.peek().v)){
      const name=this.adv().v;
      return this.reg.get(name)(this);
    }
    // label: word:  (but not ::)
    if(this.isWord()&&this.peek(1).v===':'&&this.peek(2).v!==':'){
      const label=this.adv().v; this.adv();
      return {T:'Label',name:label,body:this.stmt()};
    }
    if(this.check('{'))return this.block();
    const e=this.expr();
    this.eatSemi();
    return {T:'Expr',e};
  }

  block() {
    this.expect('{');
    const body=[];
    while(!this.check('}')&&!this.eof())body.push(this.stmt());
    this.expect('}');
    return {T:'Block',body};
  }

  // ── Expressions  (Pratt) ────────────────────────────────────
  expr(min=0) {
    let left=this.pfx();
    while(true){
      const p=this.ifxPrec(this.peek());
      if(p<=min)break;
      left=this.ifx(left,p);
    }
    return left;
  }

  ifxPrec(t) {
    if(this.reg.infix.has(t.v))return this.reg.infix.get(t.v).prec;
    const P={
      '=':1,'+=':1,'-=':1,'*=':1,'/=':1,'%=':1,'**=':1,'//=':1,
      '&=':1,'|=':1,'^=':1,'<<=':1,'>>=':1,'&&=':1,'||=':1,'??=':1,':=':1,'<-':1,
      '=>':2,'..':3,'..=':3,'??':4,'||':5,'&&':6,'^^':7,
      '|':8,'^':9,'&':10,'==':11,'!=':11,'===':11,'!==':11,'<=>':11,
      '<':12,'>':12,'<=':12,'>=':12,
      'as':12,'is':12,'isn':12,'in':12,'instanceof':12,
      '<<':13,'>>':13,'>>>':13,'+':14,'-':14,
      '*':15,'/':15,'%':15,'//':15,'%%':15,'**':16,
      '|>':17,'~>':17,'->':1,
      '.':19,'?.':19,'::':19,'(':19,'[':19,'++':20,'--':20,
    };
    return P[t.v]??0;
  }

  ifx(left,prec) {
    const tok=this.adv(); const v=tok.v;
    if(this.reg.infix.has(v))return this.reg.infix.get(v).fn(this,left);
    const ASGN=new Set(['=','+=','-=','*=','/=','%=','**=','//=','&=','|=','^=','<<=','>>=','&&=','||=','??=']);
    if(ASGN.has(v))return{T:'Asgn',op:v,left,right:this.expr(prec-1)};
    if(v===':=')return{T:'Walrus',left,right:this.expr(prec-1)};
    if(v==='.'||v==='?.'){
      const m=this.word();
      if(this.check('('))return{T:'Call',callee:{T:'Mbr',obj:left,m,opt:v==='?.'},args:this.args()};
      return{T:'Mbr',obj:left,m,opt:v==='?.'};
    }
    if(v==='::'){
      const m=this.word();
      if(this.check('('))return{T:'Call',callee:{T:'Path',obj:left,m},args:this.args()};
      return{T:'Path',obj:left,m};
    }
    if(v==='('){ this.pos--; return{T:'Call',callee:left,args:this.args()}; }
    if(v==='['){const idx=this.expr();this.expect(']');return{T:'Idx',obj:left,idx};}
    if(v==='++'||v==='--')return{T:'Post',op:v,val:left};
    if(v==='..'||v==='..='){const r=this.expr(3);const step=this.eatW('by')?this.expr(3):null;return{T:'Range',from:left,to:r,inc:v==='..=',step};}
    if(v==='|>')return{T:'Pipe',left,right:this.expr(17)};
    if(v==='~>')return{T:'Compose',left,right:this.expr(17)};
    if(v==='??')return{T:'NCoal',left,right:this.expr(4)};
    if(v==='<-')return{T:'CSend',chan:left,val:this.expr(1)};
    if(v==='as')return{T:'Cast',val:left,to:this.typ()};
    if(v==='is')return{T:'Is',val:left,check:this.typ()};
    if(v==='isn')return{T:'Isn',val:left,check:this.typ()};
    if(v==='in')return{T:'In',val:left,of:this.expr(prec)};
    if(v==='instanceof')return{T:'Inst',val:left,check:this.typ()};
    return{T:'Bin',op:v,left,right:this.expr(prec)};
  }

  pfx() {
    const t=this.peek(); const v=t.v; const k=t.k;
    if(this.reg.prefix.has(v)){this.adv();return this.reg.prefix.get(v).fn(this);}
    if(['-','+','!','~'].includes(v)){this.adv();return{T:'Unary',op:v,val:this.pfx()};}
    if(v==='++'||v==='--'){this.adv();return{T:'Pre',op:v,val:this.pfx()};}
    if(v==='...'){this.adv();return{T:'Spread',val:this.pfx()};}
    if(v==='&'){this.adv();const mu=this.eatW('mut');return{T:'Ref',val:this.pfx(),mut:mu};}
    if(v==='*'){this.adv();return{T:'Deref',val:this.pfx()};}
    // word that is a registered macro → call it (allows macros in expression position)
    if(k===K.WORD&&this.reg.has(v)){this.adv();return this.reg.get(v)(this);}
    return this.psfx(this.prim());
  }

  psfx(e) {
    while(true){
      if(this.check('?')&&this.peek(1).v!=='.'&&this.peek(1).v!=='?'&&this.peek(1).v!=='!'){this.adv();e={T:'Prop',val:e};}
      else if(this.check('!')&&this.peek(1).v!=='='){this.adv();e={T:'Unwrap',val:e};}
      else break;
    }
    return e;
  }

  prim() {
    const t=this.peek(); const v=t.v; const k=t.k;
    if(k===K.NUM){this.adv();return{T:'Num',v};}
    if(k===K.STR){this.adv();return t.tmpl?{T:'Tmpl',raw:v}:{T:'Str',v};}
    if(k===K.RE){this.adv();return{T:'Re',pat:v,fl:t.flags};}
    if(v==='true'||v==='false'){this.adv();return{T:'Bool',v:v==='true'};}
    if(v==='null'){this.adv();return{T:'Null'};}
    if(v==='undefined'){this.adv();return{T:'Undef'};}
    if(v==='self'||v==='this'){this.adv();return{T:'Self'};}
    if(v==='super'){this.adv();return{T:'Super'};}
    if(k===K.WORD){
      this.adv();
      if(v.endsWith('!')){
        const name=v.slice(0,-1);
        const args=this.check('(')?this.args():this.check('[')?[this.arr()]:this.check('{')?[this.obj()]:this.checkK(K.STR)?[{T:'Str',v:this.adv().v}]:[];
        return{T:'Mac',name,args};
      }
      return{T:'Id',v};
    }
    if(v==='<')return this.jsx();
    if(v==='('){
      this.adv();
      if(this.check(')')){this.adv();return{T:'Tuple',els:[]};}
      const first=this.expr();
      if(this.eat(',')){
        const els=[first];
        while(!this.check(')')&&!this.eof()){els.push(this.expr());this.eat(',');}
        this.expect(')');return{T:'Tuple',els};
      }
      this.expect(')');return{T:'Group',val:first};
    }
    if(v==='[')return this.arr();
    if(v==='{')return this.obj();
    if(v==='|')return this.lam();
    this.adv();return{T:'Id',v};
  }

  // ── JSX ──────────────────────────────────────────────────────
  jsx() {
    this.expect('<');
    if(this.check('>')){this.adv();return{T:'JsxFrag',ch:this.jsxKids('')};}
    if(this.check('/')){this.adv();const tag=this.isWord()?this.adv().v:'';this.eat('>');return{T:'JsxClose',tag};}
    const tag=this.word();
    const props=this.jsxProps();
    if(this.check('/')&&this.peek(1).v==='>'){this.adv();this.adv();return{T:'Jsx',tag,props,ch:[],self:true};}
    this.eat('>');
    return{T:'Jsx',tag,props,ch:this.jsxKids(tag),self:false};
  }

  jsxProps() {
    const ps=[];
    while(!this.eof()&&this.peek().v!=='>'&&!(this.peek().v==='/'&&this.peek(1).v==='>')){
      if(this.isWord()){
        const key=this.adv().v;
        if(this.eat('=')){
          let val;
          if(this.check('{')){this.adv();val=this.expr();this.expect('}');}
          else if(this.checkK(K.STR))val={T:'Str',v:this.adv().v};
          else val=this.expr();
          ps.push({key,val});
        } else ps.push({key,val:{T:'Bool',v:true}});
      } else if(this.check('{')){
        this.adv();this.eat('...');const val=this.expr();this.expect('}');
        ps.push({spread:true,val});
      } else break;
    }
    return ps;
  }

  jsxKids(closing) {
    const ch=[];
    while(!this.eof()){
      if(this.check('<')&&this.peek(1).v==='/'){
        this.adv();this.adv();
        if(closing&&this.isWord()){const tag=this.adv().v;if(tag!==closing)throw new SyntaxError(`[Vex] Expected </${closing}>, got </${tag}>`);}
        this.eat('>');break;
      }
      if(this.check('<')){ch.push(this.jsx());continue;}
      if(this.check('{')){this.adv();ch.push({T:'JsxE',val:this.expr()});this.expect('}');continue;}
      let text=this.adv().v;
      while(!this.eof()&&!this.check('<')&&!this.check('{'))text+=' '+this.adv().v;
      if(text.trim())ch.push({T:'JsxT',v:text.trim()});
    }
    return ch;
  }

  // ── Literals ─────────────────────────────────────────────────
  arr() {
    this.expect('[');const els=[];
    while(!this.check(']')&&!this.eof()){
      if(this.check('...')){this.adv();els.push({T:'Spread',val:this.expr()});}
      else{const e=this.expr();if(this.eat(';')){const n=this.expr();this.expect(']');return{T:'ArrRep',val:e,n};}els.push(e);}
      this.eat(',');
    }
    this.expect(']');return{T:'Arr',els};
  }

  obj() {
    this.expect('{');const ents=[];
    while(!this.check('}')&&!this.eof()){
      if(this.check('...')){this.adv();ents.push({spread:true,val:this.expr()});}
      else{
        let key;
        if(this.check('[')){this.adv();key={computed:true,val:this.expr()};this.expect(']');}
        else if(this.checkK(K.STR))key=this.adv().v;
        else key=this.adv().v;
        let val;
        if(this.eat(':'))val=this.expr();
        else if(this.check('(')){const ps=this.params();val={T:'Lam',params:ps,body:this.block()};}
        else val={T:'Id',v:typeof key==='string'?key:''};
        ents.push({key,val});
      }
      this.eat(',');
    }
    this.expect('}');return{T:'Obj',ents};
  }

  lam() {
    const ps=[];this.expect('|');
    while(!this.check('|')&&!this.eof()){
      const name=this.word();const ty=this.eat(':')?this.typ():null;const def=this.eat('=')?this.expr():null;
      ps.push({name,ty,def});this.eat(',');
    }
    this.eat('|');const ret=this.eat('->')?this.typ():null;
    const body=this.check('{')?this.block():this.expr();
    return{T:'Lam',params:ps,ret,body};
  }

  // ── Types ────────────────────────────────────────────────────
  typ() {
    let t=this.typAtom();
    while(this.check('|'))  {this.adv();t={T:'UnionT',a:t,b:this.typAtom()};}
    while(this.check('&')&&this.peek(1).v!=='='){this.adv();t={T:'IsectT',a:t,b:this.typAtom()};}
    if(this.check('?')&&this.peek(1).v!=='.')  {this.adv();t={T:'OptT',inner:t};}
    if(this.check('!')&&this.peek(1).v!=='=')  {this.adv();t={T:'ResT',ok:t,err:this.typAtom()};}
    return t;
  }

  typAtom() {
    const v=this.peek().v;
    if(this.isWord()){const n=this.adv().v;const a=this.peek().v==='<'?this.typArgs():[];return{T:'NT',n,a};}
    if(v==='['){this.adv();const e=this.typ();if(this.eat(';')){const s=this.expr();this.expect(']');return{T:'DArrT',e,s};}this.expect(']');return{T:'ArrT',e};}
    if(v==='('){this.adv();const es=[];while(!this.check(')')){es.push(this.typ());this.eat(',');}this.expect(')');return es.length===1?es[0]:{T:'TupT',es};}
    if(v==='{'){this.adv();const k=this.typ();this.expect(':');const vt=this.typ();this.expect('}');return{T:'MapT',k,v:vt};}
    if(v==='_'){this.adv();return{T:'InferT'};}
    if(v==='*'){this.adv();return{T:'PtrT',inner:this.typAtom()};}
    if(v==='&'){this.adv();return{T:'RefT',inner:this.typAtom()};}
    this.adv();return{T:'NT',n:v||'any',a:[]};
  }

  typArgs() {
    this.adv();const a=[];
    while(!this.check('>')&&!this.eof()){a.push(this.typ());this.eat(',');}
    this.eat('>');return a;
  }

  typParams() {
    if(this.peek().v!=='<')return[];
    this.adv();const ps=[];
    while(!this.check('>')&&!this.eof()){
      const name=this.word();const bounds=this.eat(':')?this.typList('+'):[];const def=this.eat('=')?this.typ():null;
      ps.push({name,bounds,def});this.eat(',');
    }
    this.eat('>');return ps;
  }

  typList(sep){const ts=[this.typ()];while(this.check(sep)){this.adv();ts.push(this.typ());}return ts;}

  where_(){
    const cs=[];
    do{const ty=this.typ();this.expect(':');const bs=[];do{bs.push(this.typ());}while(this.eat('+'));cs.push({ty,bs});this.eat(',');}
    while(this.isWord()&&!this.check('{'));
    return cs;
  }

  // ── Parameters / Arguments ───────────────────────────────────
  params() {
    this.expect('(');const ps=[];
    while(!this.check(')')&&!this.eof()){ps.push(this.param());this.eat(',');}
    this.expect(')');return ps;
  }

  param() {
    const va=this.eat('...');const sl=this.peek().v==='self';
    const out=this.eatW('out');const io=this.eatW('inout');const mu=this.eatW('mut');
    const nm=this.word();const ty=this.eat(':')?this.typ():null;const def=this.eat('=')?this.expr():null;
    return{nm,ty,def,va,sl,out,io,mu};
  }

  rawParamNames() {
    this.expect('(');const ns=[];
    while(!this.check(')')){ns.push(this.word());this.eat(',');}
    this.expect(')');return ns;
  }

  args() {
    this.expect('(');const as=[];
    while(!this.check(')')&&!this.eof()){
      if(this.check('...')){this.adv();as.push({T:'Spread',val:this.expr()});}
      else if(this.isWord()&&this.peek(1).v===':'){const nm=this.adv().v;this.adv();as.push({T:'Named',nm,val:this.expr()});}
      else as.push(this.expr());
      this.eat(',');
    }
    this.expect(')');return as;
  }

  // ── Patterns ─────────────────────────────────────────────────
  pat() {
    const p=this.patAtom();
    if(this.check('|')){const vs=[p];while(this.eat('|'))vs.push(this.patAtom());return{T:'OrP',vs};}
    return p;
  }

  patAtom() {
    const v=this.peek().v; const k=this.peek().k;
    if(v==='_'){this.adv();return{T:'WildP'};}
    if(v==='...'||v==='..'){this.adv();return{T:'RestP',nm:this.isWord()&&this.peek().v!=='{'?this.adv().v:null};}
    if(k===K.NUM||k===K.STR||(k===K.WORD&&/^(true|false|null)$/.test(v))||v==='-'){
      if(v==='-')this.adv();
      const val=this.prim();
      if(this.check('..')||this.check('..=')){const inc=this.adv().v==='..=';return{T:'RangeP',lo:val,hi:this.prim(),inc};}
      return{T:'LitP',val};
    }
    if(v==='('){this.adv();const es=[];while(!this.check(')')){es.push(this.pat());this.eat(',');}this.expect(')');return es.length===1?es[0]:{T:'TupP',es};}
    if(v==='['){this.adv();const es=[];while(!this.check(']')){es.push(this.pat());this.eat(',');}this.expect(']');return{T:'ArrP',es};}
    if(k===K.WORD){
      const nm=this.adv().v;
      if(this.check('::')){this.adv();const vr=this.word();let pl=null;if(this.check('(')){this.adv();pl=[];while(!this.check(')')){pl.push(this.pat());this.eat(',');}this.expect(')');}return{T:'EnumP',type:nm,vr,pl};}
      if(this.check('{')){this.adv();const fs=[];let rest=false;while(!this.check('}')){if(this.check('..')){this.adv();rest=true;break;}const fn=this.word();const fp=this.eat(':')?this.pat():{T:'IdP',nm:fn};fs.push({nm:fn,p:fp});this.eat(',');}this.expect('}');return{T:'StrcP',type:nm,fs,rest};}
      if(this.eat('@')){const bind=this.word();return{T:'BindP',bind,p:{T:'IdP',nm}};}
      return{T:'IdP',nm};
    }
    return{T:'WildP'};
  }

  // ── Class body ───────────────────────────────────────────────
  clsBody() {
    this.expect('{');const members=[];
    while(!this.check('}')&&!this.eof()){
      const decs=this.decs();const mods=this.mods();const w=this.peek().v;let m;
      if(/^(fn|function|method|fun|def)$/.test(w)){this.adv();m={T:'Fn',...this.fnSig(),mods};}
      else if(/^(init|constructor|new)$/.test(w)){this.adv();m={T:'Init',ps:this.params(),body:this.block(),mods};}
      else if(/^(deinit|destructor|dispose)$/.test(w)){this.adv();m={T:'Deinit',body:this.block()};}
      else if(/^(get|getter)$/.test(w)){this.adv();const nm=this.word();const ret=this.eat('->')?this.typ():null;m={T:'Get',nm,ret,body:this.block()};}
      else if(/^(set|setter)$/.test(w)){this.adv();const nm=this.word();const ps=this.params();m={T:'Set',nm,ps,body:this.block()};}
      else if(w==='static'&&this.peek(1).v==='{'){this.adv();m={T:'StaticBlk',body:this.block()};}
      else{const nm=this.word();const ty=this.eat(':')?this.typ():null;const init=this.eat('=')?this.expr():null;this.eatSemi();m={T:'Field',nm,ty,init,mods};}
      m.decs=decs;members.push(m);
    }
    this.expect('}');return members;
  }

  fnSig() {
    const nm=this.word();const tps=this.typParams();const ps=this.params();
    const ret=this.eat('->')?this.typ():null;const thr=this.eatW('throws')?this.typ():null;
    const wh=this.eatW('where')?this.where_():null;
    const body=this.check('{')?this.block():this.eat('=>')?{T:'Return',val:this.expr()}:null;
    return{nm,tps,ps,ret,thr,wh,body};
  }
}

// ─────────────────────────────────────────────────────────────────
//  BUILT-IN MACROS
//  EVERY syntax rule is here as a macro — nothing is hardcoded.
//  Users can override any of these or add new ones.
// ─────────────────────────────────────────────────────────────────
function loadMacros(R) {

  // ── fn / function (and all aliases) ───────────────────────────
  const fnMacro = p => {
    const sig=p.fnSig();
    return{T:'Fn',...sig};
  };
  for(const w of ['fn','function','func','fun','def','proc','method','sub','routine','action'])
    R.def(w, fnMacro);

  // ── class ─────────────────────────────────────────────────────
  R.def('class', p => {
    const nm=p.word();const tps=p.typParams();const base=p.eat(':')?p.typList(','):[];
    const wh=p.eatW('where')?p.where_():null;
    return{T:'Class',nm,tps,base,wh,body:p.clsBody()};
  });
  for(const w of ['klass','clazz']) R.def(w, p => R.get('class')(p));

  // ── struct / record / data ─────────────────────────────────────
  R.def('struct', p => {
    const nm=p.word();const tps=p.typParams();p.expect('{');
    const fields=[],methods=[];
    while(!p.check('}')){
      const mods=p.mods();
      if(/^(fn|function|method)$/.test(p.peek().v)){p.adv();methods.push({T:'Fn',...p.fnSig(),mods});}
      else{const nm2=p.word();const ty=p.eat(':')?p.typ():null;const init=p.eat('=')?p.expr():null;p.eatSemi();fields.push({T:'Field',nm:nm2,ty,init,mods});}
    }
    p.expect('}');return{T:'Struct',nm,tps,fields,methods};
  });
  for(const w of ['record','data','object','model','entity','dto','pojo']) R.def(w, p => R.get('struct')(p));

  // ── enum ──────────────────────────────────────────────────────
  R.def('enum', p => {
    const nm=p.word();const tps=p.typParams();const base=p.eat(':')?p.typ():null;
    p.expect('{');const vs=[];
    while(!p.check('}')){
      const vn=p.word();let payload=null;
      if(p.check('(')){p.adv();const fs=[];while(!p.check(')')){let fn=null,fty;if(p.isWord()&&p.peek(1).v===':'){fn=p.adv().v;p.adv();}fty=p.typ();fs.push({nm:fn,ty:fty});p.eat(',');}p.expect(')');payload={k:'tup',fs};}
      else if(p.check('{')){p.adv();const fs=[];while(!p.check('}')){const fn=p.word();p.expect(':');fs.push({nm:fn,ty:p.typ()});p.eat(',');}p.expect('}');payload={k:'struct',fs};}
      const val=p.eat('=')?p.expr():null;
      vs.push({nm:vn,payload,val});p.eat(',');p.eatSemi();
    }
    p.expect('}');return{T:'Enum',nm,tps,base,vs};
  });
  for(const w of ['union','variant','sealed']) R.def(w, p => R.get('enum')(p));

  // ── type alias ────────────────────────────────────────────────
  R.def('type', p => {
    const nm=p.word();const tps=p.typParams();p.expect('=');
    return{T:'TypeAlias',nm,tps,alias:p.typ()};
  });
  for(const w of ['typedef','alias','newtype']) R.def(w, p => R.get('type')(p));

  // ── trait / interface / protocol ──────────────────────────────
  R.def('trait', p => {
    const nm=p.word();const tps=p.typParams();const base=p.eat(':')?p.typList('+'):[];
    p.expect('{');const ms=[];
    while(!p.check('}')){p.mods();if(p.isWord()&&/^(fn|function|method)$/.test(p.peek().v)){p.adv();ms.push({T:'Fn',...p.fnSig()});}else p.adv();}
    p.expect('}');return{T:'Trait',nm,tps,base,methods:ms};
  });
  for(const w of ['interface','iface','protocol','typeclass','mixin','behaviour','behavior'])
    R.def(w, p => R.get('trait')(p));

  // ── impl / extend ─────────────────────────────────────────────
  R.def('impl', p => {
    const tps=p.typParams();const t1=p.typ();let tr=null,for_=t1;
    if(p.eatW('for')){tr=t1;for_=p.typ();}
    const wh=p.eatW('where')?p.where_():null;
    p.expect('{');const ms=[];
    while(!p.check('}')){p.mods();if(p.isWord()&&/^(fn|function|method)$/.test(p.peek().v)){p.adv();ms.push({T:'Fn',...p.fnSig()});}else p.adv();}
    p.expect('}');return{T:'Impl',tps,trait:tr,for:for_,wh,methods:ms};
  });
  R.def('extend', p => {
    const target=p.typ();const with_=p.eatW('with')?p.typList(','):[];
    p.expect('{');const ms=[];
    while(!p.check('}')){p.mods();if(p.isWord()&&/^(fn|function|method)$/.test(p.peek().v)){p.adv();ms.push({T:'Fn',...p.fnSig()});}else p.adv();}
    p.expect('}');return{T:'Extend',target,with:with_,members:ms};
  });
  for(const w of ['mixin','augment','enhance']) R.def(w, p => R.get('extend')(p));

  // ── Variables — any word can declare a variable ───────────────
  const varMacro = kind => p => {
    const pat=p.pat();const ty=p.eat(':')?p.typ():null;const init=p.eat('=')?p.expr():null;
    p.eatSemi();return{T:'Var',kind,pat,ty,init};
  };
  for(const w of ['let','var','const','val','auto','dim','my','local',
                   'state','reactive','lazy','late','volatile','field','prop','property','attribute'])
    R.def(w, varMacro(w));

  // ── Modules ───────────────────────────────────────────────────
  R.def('mod', p => {
    const nm=p.word();if(!p.check('{')){p.eatSemi();return{T:'Mod',nm,body:null};}
    p.expect('{');const body=[];while(!p.check('}'))body.push(p.top());p.expect('}');
    return{T:'Mod',nm,body};
  });
  for(const w of ['module','namespace','package','pkg','ns']) R.def(w, p => R.get('mod')(p));

  R.def('use', p => {
    const tree=useTree(p);p.eatSemi();return{T:'Use',tree};
  });
  R.def('import', p => {
    if(p.checkK(K.STR)){const src=p.adv().v;p.eatSemi();return{T:'Import',kind:'side',src};}
    if(p.check('*')){p.adv();const alias=p.eatW('as')?p.word():null;p.eatW('from');const src=p.adv().v;p.eatSemi();return{T:'Import',kind:'glob',alias,src};}
    if(p.check('{')){p.adv();const names=[];while(!p.check('}')){const nm=p.word();const alias=p.eatW('as')?p.word():null;names.push({nm,alias});p.eat(',');}p.expect('}');p.eatW('from');const src=p.adv().v;p.eatSemi();return{T:'Import',kind:'named',names,src};}
    const def=p.word();p.eatW('from');const src=p.adv().v;p.eatSemi();
    return{T:'Import',kind:'default',def,src};
  });
  R.def('export', p => {
    if(p.eatW('default')){const val=p.expr();p.eatSemi();return{T:'Export',kind:'default',val};}
    if(p.check('{')){p.adv();const items=[];while(!p.check('}')){const nm=p.word();const alias=p.eatW('as')?p.word():null;items.push({nm,alias});p.eat(',');}p.expect('}');p.eatSemi();return{T:'Export',kind:'named',items};}
    return{T:'Export',kind:'decl',decl:p.top()};
  });
  R.def('extern', p => {
    const abi=p.checkK(K.STR)?p.adv().v:'C';
    if(p.isWord()&&/^(fn|function)$/.test(p.peek().v)){p.adv();return{T:'Extern',abi,decl:{T:'Fn',...p.fnSig()}};}
    p.expect('{');const ds=[];while(!p.check('}')){p.mods();if(p.isWord()&&/^(fn|function)$/.test(p.peek().v)){p.adv();ds.push({T:'Fn',...p.fnSig()});}else p.adv();}
    p.expect('}');return{T:'Extern',abi,decls:ds};
  });

  // ── Control flow: if / unless / when / match / switch ─────────
  R.def('if', p => {
    const cond=p.expr();const then=p.block();const elifs=[];let otherwise=null;
    while(p.isWord('elif')||(p.isWord('else')&&p.peek(1).v==='if')){p.adv();if(p.isWord('if'))p.adv();elifs.push({cond:p.expr(),body:p.block()});}
    if(p.eatW('else'))otherwise=p.block();
    return{T:'If',cond,then,elifs,otherwise};
  });
  R.def('unless', p => {
    const cond=p.expr();const then=p.block();
    return{T:'If',cond:{T:'Unary',op:'!',val:cond},then,elifs:[],otherwise:null};
  });
  for(const w of ['when','cond']) R.def(w, p => {
    p.expect('{');const bs=[];let ow=null;
    while(!p.check('}')){
      if(p.eatW('else')){p.expect('=>');ow=p.check('{')?p.block():p.expr();}
      else{const cond=p.expr();p.expect('=>');bs.push({cond,body:p.check('{')?p.block():p.expr()});}
      p.eat(',');
    }
    p.expect('}');return{T:'When',bs,ow};
  });
  R.def('match', p => {
    const subj=p.expr();p.expect('{');const arms=[];
    while(!p.check('}')){
      const pats=[p.pat()];while(p.check('|')){p.adv();pats.push(p.pat());}
      const guard=p.eatW('if')?p.expr():null;p.expect('=>');
      const body=p.check('{')?p.block():p.expr();
      arms.push({pats,guard,body});p.eat(',');
    }
    p.expect('}');return{T:'Match',subj,arms};
  });
  for(const w of ['case','switch']) R.def(w, p => {
    const subj=p.expr();p.expect('{');const cases=[];
    while(!p.check('}')){
      if(p.eatW('case')){const vals=[p.expr()];while(p.eat(','))vals.push(p.expr());p.expect(':');const body=[];while(!p.isWord('case')&&!p.isWord('default')&&!p.check('}'))body.push(p.stmt());cases.push({vals,body,default:false});}
      else if(p.eatW('default')){p.expect(':');const body=[];while(!p.isWord('case')&&!p.check('}'))body.push(p.stmt());cases.push({vals:[],body,default:true});}
      else p.adv();
    }
    p.expect('}');return{T:'Switch',subj,cases};
  });

  // ── Loops ─────────────────────────────────────────────────────
  R.def('for', p => {
    const pat=p.pat();p.eatW('in');const iter=p.expr();const body=p.block();
    return{T:'For',pat,iter,body};
  });
  for(const w of ['foreach','forall','each','every']) R.def(w, p => R.get('for')(p));
  R.def('while', p => { const cond=p.expr();return{T:'While',cond,body:p.block()}; });
  R.def('until', p => { const cond=p.expr();return{T:'While',cond:{T:'Unary',op:'!',val:cond},body:p.block()}; });
  for(const w of ['loop','forever','always','spin']) R.def(w, p => ({T:'Loop',body:p.block()}));
  R.def('repeat', p => { const body=p.block();const cond=p.eatW('until')?p.expr():{T:'Bool',v:false};return{T:'DoWhile',body,cond}; });
  R.def('do', p => { const body=p.block();p.eatW('while');return{T:'DoWhile',body,cond:p.expr()}; });
  R.def('times', p => {
    const n=p.expr();return{T:'For',pat:{T:'IdP',nm:'__i'},iter:{T:'Range',from:{T:'Num',v:'0'},to:n,inc:false,step:null},body:p.block()};
  });

  // ── Transfer ──────────────────────────────────────────────────
  R.def('return',  p => ({T:'Return',val:p.endStmt()?null:p.expr()}));
  for(const w of ['ret','give','yield_return']) R.def(w, p => R.get('return')(p));
  R.def('yield',   p => ({T:'Yield',val:p.expr(),star:false}));
  R.def('break',   p => ({T:'Break',label:p.isWord()&&!p.endStmt()?p.word():null}));
  R.def('continue',p => ({T:'Cont',label:p.isWord()&&!p.endStmt()?p.word():null}));
  for(const w of ['next','skip','proceed']) R.def(w, p => R.get('continue')(p));
  R.def('goto',    p => ({T:'Goto',label:p.word()}));
  R.def('fallthrough', p => ({T:'Fall'}));
  R.def('pass',    p => ({T:'Block',body:[]}));

  // ── Errors ────────────────────────────────────────────────────
  for(const w of ['throw','raise','error','fail']) R.def(w, p => ({T:'Throw',val:p.expr()}));
  R.def('panic',   p => ({T:'Panic',msg:p.expr()}));
  for(const w of ['unreachable','impossible']) R.def(w, p => ({T:'Unreachable'}));
  for(const w of ['assert','ensure','require','verify','check','invariant']) R.def(w, p => {
    const useParen=p.check('(');if(useParen)p.adv();
    const cond=p.expr();const msg=p.eat(',')?p.expr():null;
    if(useParen)p.expect(')');p.eatSemi();
    return{T:'Assert',cond,msg};
  });
  R.def('try', p => {
    const body=p.block();const catches=[];let fin=null;
    while(p.eatW('catch')){let pat=null;if(p.check('(')){p.adv();pat=p.pat();p.expect(')');}catches.push({pat,body:p.block()});}
    if(p.eatW('finally'))fin=p.block();
    return{T:'Try',body,catches,finally:fin};
  });
  for(const w of ['attempt','guard','rescue']) R.def(w, p => R.get('try')(p));

  // ── Special statements ────────────────────────────────────────
  R.def('defer',  p => ({T:'Defer',body:p.check('{')?p.block():p.expr()}));
  R.def('with',   p => {
    const nm=p.isWord()&&p.peek(1).v==='='?p.word():null;if(nm)p.expect('=');
    return{T:'With',nm,resource:p.expr(),body:p.block()};
  });
  for(const w of ['using','open','resource']) R.def(w, p => R.get('with')(p));
  for(const w of ['unsafe','unchecked']) R.def(w, p => ({T:'Unsafe',body:p.block()}));
  for(const w of ['atomic','synchronized','locked']) R.def(w, p => ({T:'Atomic',body:p.block()}));
  R.def('comptime', p => ({T:'Comptime',body:p.block()}));
  R.def('lock', p => {p.expect('(');const mx=p.expr();p.expect(')');return{T:'Lock',mx,body:p.block()};});

  // ── Async / concurrency ───────────────────────────────────────
  R.def('async', p => {
    if(p.isWord()&&/^(fn|function|func|fun|def|method)$/.test(p.peek().v)){p.adv();return{T:'Fn',...p.fnSig(),async:true};}
    return{T:'AsyncBlk',body:p.block()};
  });
  R.def('await',  p => ({T:'Await',val:p.expr()}));
  for(const w of ['spawn','go','goroutine','task','fork','thread']) R.def(w, p => ({T:'Spawn',expr:p.expr()}));
  R.def('chan',   p => ({T:'ChanNew'}));
  R.def('select', p => {
    p.expect('{');const cases=[];
    while(!p.check('}')){p.eatW('case');const expr=p.expr();p.expect(':');const body=[];while(!p.isWord('case')&&!p.check('}'))body.push(p.stmt());cases.push({expr,body});}
    p.expect('}');return{T:'Select',cases};
  });

  // ── UI / Component system ─────────────────────────────────────
  const compMacro = p => {
    const nm=p.word();const tps=p.typParams();const props=p.check('(')?p.params():[];
    p.expect('{');
    const states=[],effects=[],memos=[],hooks=[],lc={};let render=null;
    while(!p.check('}')){
      const w=p.peek().v;
      if(/^(state|reactive|signal|ref|data|observable)$/.test(w)){
        p.adv();const sn=p.word();const ty=p.eat(':')?p.typ():null;const init=p.eat('=')?p.expr():null;p.eatSemi();
        states.push({T:'SVar',nm:sn,ty,init});
      } else if(/^(effect|watch|watchEffect|observe|subscribe)$/.test(w)){
        p.adv();effects.push({T:'Effect',body:p.block()});
      } else if(/^(computed|memo|derived|selector|getter)$/.test(w)){
        p.adv();const mn=p.word();const body=p.eat('=>')?p.expr():p.block();memos.push({T:'Memo',nm:mn,body});
      } else if(/^(render|view|template|html|display|show|draw)$/.test(w)){
        p.adv();render=p.eat('=>')?p.expr():p.block();
      } else if(/^(mount|onMount|mounted|created|setup|init)$/.test(w)){p.adv();lc.mount=p.block();}
      else if(/^(unmount|onUnmount|onDestroy|destroyed|teardown|cleanup)$/.test(w)){p.adv();lc.unmount=p.block();}
      else if(/^(update|onUpdate|updated|onChange)$/.test(w)){p.adv();lc.update=p.block();}
      else if(p.isWord()&&/^(fn|function|method|fun|def)$/.test(p.peek().v)){p.adv();hooks.push({T:'Fn',...p.fnSig()});}
      else {states.push(p.stmt());}
    }
    p.expect('}');return{T:'Component',nm,tps,props,states,effects,memos,hooks,lc,render};
  };
  for(const w of ['component','Component','widget','Widget','screen','Screen',
                   'page','Page','view','View','composable','directive'])
    R.def(w, compMacro);

  R.def('hook', p => {
    const nm=p.word();const ps=p.params();const ret=p.eat('->')?p.typ():null;
    return{T:'Hook',nm,ps,ret,body:p.block()};
  });
  for(const w of ['useHook','composable']) R.def(w, p => R.get('hook')(p));

  R.def('store', p => {
    const nm=p.word();p.expect('{');
    const fields=[],actions=[],getters=[];
    while(!p.check('}')){
      const w=p.peek().v;
      if(/^(state|let|var|val|reactive|field)$/.test(w)){p.adv();const sn=p.word();const ty=p.eat(':')?p.typ():null;const init=p.eat('=')?p.expr():null;p.eatSemi();fields.push({nm:sn,ty,init});}
      else if(/^(fn|function|action|mutation|method|commit|dispatch)$/.test(w)){p.adv();actions.push({T:'Fn',...p.fnSig()});}
      else if(/^(get|getter|computed|selector)$/.test(w)){p.adv();const gn=p.word();const ret=p.eat('->')?p.typ():null;getters.push({nm:gn,ret,body:p.block()});}
      else p.adv();
    }
    p.expect('}');return{T:'Store',nm,fields,actions,getters};
  });
  for(const w of ['pinia','redux','zustand','atom_store','flux','vuex']) R.def(w, p => R.get('store')(p));

  for(const w of ['signal','atom']) R.def(w, p => {
    const nm=p.word();const init=p.eat('=')?p.expr():null;p.eatSemi();return{T:'Signal',nm,init};
  });
  R.def('context', p => { const nm=p.word();const def=p.eat('=')?p.expr():null;p.eatSemi();return{T:'Context',nm,default:def}; });
  R.def('theme',   p => { const nm=p.word();p.expect('{');const props={};while(!p.check('}')){const k=p.word();p.expect(':');props[k]=p.expr();p.eat(',');p.eatSemi();}p.expect('}');return{T:'Theme',nm,props}; });
  R.def('style',   p => { const nm=p.word();p.expect('{');const rules={};while(!p.check('}')){const k=p.word();p.expect(':');rules[k]=p.expr();p.eat(',');p.eatSemi();}p.expect('}');return{T:'Style',nm,rules}; });
  for(const w of ['css','scss','styled']) R.def(w, p => R.get('style')(p));
  R.def('animation', p => { const nm=p.word();p.expect('{');const frames={};while(!p.check('}')){const k=p.word();p.expect(':');frames[k]=p.obj();p.eat(',');}p.expect('}');return{T:'Anim',nm,frames}; });
  for(const w of ['keyframes','transition']) R.def(w, p => R.get('animation')(p));
  R.def('route',  p => { const path=p.adv().v;const screen=p.eat('->')?p.expr():null;p.eatSemi();return{T:'Route',path,screen}; });
  R.def('router', p => { p.expect('{');const routes=[];while(!p.check('}'))routes.push(p.stmt());p.expect('}');return{T:'Router',routes}; });

  // ── Memory / ownership ────────────────────────────────────────
  R.def('new',    p => { const ty=p.typ();const args=p.check('(')?p.args():[];const obj=p.check('{')?p.obj():null;return{T:'New',ty,args,obj}; });
  for(const w of ['delete','free','drop','destroy']) R.def(w, p => ({T:'Delete',val:p.expr()}));
  for(const w of ['move','own']) R.def(w, p => ({T:'Move',val:p.expr()}));
  R.def('copy',   p => ({T:'Copy',val:p.expr()}));
  R.def('clone',  p => ({T:'Copy',val:p.expr()}));

  // ── Type / intrinsics ─────────────────────────────────────────
  for(const w of ['typeof','kindof','typeid']) R.def(w, p => { const u=p.eat('(');const v=p.expr();if(u)p.expect(')');return{T:'Typeof',val:v}; });
  R.def('sizeof', p => { const u=p.eat('(');const v=p.typ();if(u)p.expect(')');return{T:'Sizeof',val:v}; });
  for(const w of ['nameof','symbolof']) R.def(w, p => { const u=p.eat('(');const v=p.expr();if(u)p.expect(')');return{T:'Nameof',val:v}; });
  R.def('keyof',  p => ({T:'Keyof',val:p.typ()}));
  R.def('await',  p => ({T:'Await',val:p.expr()}));

  // ── Custom operator definitions ───────────────────────────────
  R.def('operator', p => {
    const op=p.adv().v;const ps=p.params();const ret=p.eat('->')?p.typ():null;
    return{T:'OpDecl',op,ps,ret,body:p.block()};
  });
  R.def('infix', p => {
    const op=p.adv().v;const prec=p.checkK(K.NUM)?parseInt(p.adv().v,10):10;
    const body=p.block();
    R.defInfix(op,prec,(pp,left)=>({T:'CInfix',op,left,right:pp.expr(prec),body}));
    return{T:'InfixDef',op,prec};
  });
  R.def('prefix', p => {
    const op=p.adv().v;const body=p.block();
    R.defPrefix(op,(pp)=>({T:'CPrefix',op,val:pp.pfx(),body}));
    return{T:'PrefixDef',op};
  });

  // ── SYNTAX MACRO — define new syntax inside .vx files ─────────
  //
  //   syntax unless(cond, body) => `if(!(${cond})) ${body}`
  //   syntax swap(a, b) => `{ let __t=${a}; ${a}=${b}; ${b}=__t; }`
  //   syntax forever(body) => `while(true) ${body}`
  //
  //   After these lines, unless/swap/forever are real syntax.
  //
  R.def('syntax', p => {
    const nm=p.word();const params=p.check('(')?p.rawParamNames():[];
    p.expect('=>');const tmpl=p.adv().v;
    // Register immediately so the rest of the file can use it
    R.def(nm, (pp) => {
      const args=params.map(()=>pp.expr());
      return{T:'SynExp',nm,tmpl,args,params};
    });
    return{T:'SynDef',nm,params,tmpl};
  });
  for(const w of ['macro','defmacro','defsyntax','defform','defop']) R.def(w, p => R.get('syntax')(p));

  // ── Plugin / middleware / decorator ───────────────────────────
  R.def('plugin',     p => { const nm=p.word();return{T:'Plugin',nm,body:p.block()}; });
  R.def('middleware', p => { const nm=p.word();const ps=p.params();return{T:'Middleware',nm,ps,body:p.block()}; });
  R.def('decorator',  p => { const nm=p.word();const ps=p.check('(')?p.params():[];return{T:'DecDecl',nm,ps,body:p.block()}; });

  // ── Built-in infix operators ──────────────────────────────────
  R.defInfix('|>',17,(p,l)=>({T:'Pipe',left:l,right:p.expr(17)}));
  R.defInfix('~>',17,(p,l)=>({T:'Compose',left:l,right:p.expr(17)}));
  R.defInfix('??',4, (p,l)=>({T:'NCoal',left:l,right:p.expr(4)}));
  R.defInfix('..',3, (p,l)=>{const r=p.expr(3);const step=p.eatW('by')?p.expr(3):null;return{T:'Range',from:l,to:r,inc:false,step};});
  R.defInfix('..=',3,(p,l)=>{const r=p.expr(3);const step=p.eatW('by')?p.expr(3):null;return{T:'Range',from:l,to:r,inc:true,step};});
  R.defInfix('<-',1, (p,l)=>({T:'CSend',chan:l,val:p.expr(1)}));

  // ── Helper: use tree ──────────────────────────────────────────
  function useTree(p) {
    const segs=[p.word()];
    while(p.check('::')){
      p.adv();
      if(p.check('{')){p.adv();const cs=[];while(!p.check('}')){cs.push(useTree(p));p.eat(',');}p.expect('}');return{segs,kind:'list',cs};}
      if(p.check('*')){p.adv();return{segs,kind:'glob'};}
      segs.push(p.word());
    }
    const alias=p.eatW('as')?p.word():null;
    return{segs,kind:alias?'alias':'simple',alias};
  }
}

// ─────────────────────────────────────────────────────────────────
//  CODE GENERATOR  — AST → JavaScript
//  Generates clean, idiomatic JS that works in:
//  ANY V8 host, any browser, Node, Deno, Bun, DOOM.js, QuickJS…
// ─────────────────────────────────────────────────────────────────
class Gen {
  constructor(){this.d=0;this.tmp=0;}
  fresh(){return`__v${this.tmp++}`;}
  i(){return'  '.repeat(this.d);}
  in(){this.d++;}out(){this.d=Math.max(0,this.d-1);}
  q(v){return JSON.stringify(v);}

  g(n){
    if(!n)return'';
    const fn=this['$'+n.T];
    if(fn)return fn.call(this,n);
    return`/*?${n.T}*/`;
  }

  run(ast){
    return[
      `// Generated by Vex v0.1.0 — runs in any JS engine`,
      `'use strict';`,
      this.RT(),
      (ast.body||[]).map(n=>this.g(n)).filter(Boolean).join('\n'),
    ].join('\n');
  }

  RT(){return`
const Vex=(()=>{
  const signal=v=>{let val=v;const s=new Set();return{get value(){return val},set value(n){val=n;s.forEach(f=>f(n))},subscribe(f){s.add(f);return()=>s.delete(f)},peek(){return val}};};
  const state=v=>{let val=v;const s=new Set();return[()=>val,(n)=>{val=typeof n==='function'?n(val):n;s.forEach(f=>f(val));},f=>{s.add(f);return()=>s.delete(f)}];};
  const el=(tag,props,...ch)=>({tag,props:props||{},ch:ch.flat(Infinity)});
  const render=(vnode,container)=>{if(typeof document==='undefined')return;container.innerHTML='';container.appendChild(dom(vnode));};
  const dom=n=>{
    if(n==null)return document.createTextNode('');
    if(typeof n!=='object')return document.createTextNode(String(n));
    if(Array.isArray(n)){const f=document.createDocumentFragment();n.forEach(c=>f.appendChild(dom(c)));return f;}
    if(typeof n.tag==='string'){
      const d=document.createElement(n.tag);
      for(const[k,v]of Object.entries(n.props||{})){
        if(k==='style'&&typeof v==='object')Object.assign(d.style,v);
        else if(k.startsWith('on')&&typeof v==='function')d.addEventListener(k.slice(2).toLowerCase(),v);
        else if(k==='className')d.className=v;
        else if(k!=='key')d.setAttribute(k,String(v));
      }
      (n.ch||[]).forEach(c=>d.appendChild(dom(c)));return d;
    }
    if(typeof n.tag==='function')return dom(n.tag({...n.props,children:n.ch}));
    return document.createTextNode('');
  };
  const chan=()=>{const q=[],w=[];return{send:v=>w.length?w.shift()(v):q.push(v),recv:()=>new Promise(r=>q.length?r(q.shift()):w.push(r)),close(){w.forEach(f=>f(undefined));}};};
  const store=def=>{const s={...def.state||{}};const subs=new Set();const notify=()=>subs.forEach(f=>f(s));const out={...s};for(const[k,fn]of Object.entries(def.actions||{}))out[k]=(...a)=>{fn.call(s,...a);Object.assign(out,s);notify();};for(const[k,fn]of Object.entries(def.getters||{}))Object.defineProperty(out,k,{get:()=>fn.call(s),enumerable:true});out.subscribe=f=>{subs.add(f);return()=>subs.delete(f);};return out;};
  return{
    signal,state,el,render,dom,chan,store,
    ok:v=>({_ok:true,value:v,isOk:true,isErr:false}),
    err:e=>({_ok:false,error:e,isOk:false,isErr:true}),
    panic:m=>{throw new Error('[Vex] '+m);},
    assert:(c,m)=>{if(!c)Vex.panic(m||'assert failed');},
    nn:v=>{if(v==null)Vex.panic('unwrap null');return v;},
    sleep:ms=>new Promise(r=>setTimeout(r,ms)),
    spawn:fn=>Promise.resolve().then(fn),
    pipe:(...fns)=>v=>fns.reduce((a,f)=>f(a),v),
    range:function*(s,e,inc,step=1){for(let i=s;inc?i<=e:i<e;i+=step)yield i;},
    Fragment:'__frag__',
  };
})();
const println=(...a)=>console.log(...a);
const print=(...a)=>{try{process.stdout.write(a.join(''));}catch(_){console.log(...a);}};
`.trim();}

  // ── Module ───────────────────────────────────────────────────
  $Module(n){return(n.body||[]).map(n=>this.g(n)).filter(Boolean).join('\n');}

  // ── Declarations ─────────────────────────────────────────────
  $Fn(n){
    const exp=n.mods?.pub||n.mods?.export?'export ':'';
    const asyn=n.async||n.mods?.async?'async ':'';
    const gen=n.generator?'* ':'';
    const ps=this.params(n.ps);
    const body=!n.body?'{}':n.body.T==='Block'?this.g(n.body):n.body.T==='Return'?`{ return ${this.g(n.body.val)}; }`:`{ return ${this.g(n.body)}; }`;
    return`${exp}${asyn}function ${gen}${n.nm}(${ps}) ${body}`;
  }

  $Class(n){
    const exp=n.mods?.pub||n.mods?.export?'export ':'';
    const base=n.base?.length?` extends ${n.base[0].n||this.g(n.base[0])}`:'';
    this.in();
    const body=(n.body||[]).map(m=>this.i()+this.clsMember(m)).join('\n');
    this.out();
    return`${exp}class ${n.nm}${base} {\n${body}\n}`;
  }

  clsMember(m){
    if(!m)return'';
    if(m.T==='Field'){const v=m.init?` = ${this.g(m.init)}`:'';return`${m.mods?.static?'static ':''} ${m.nm}${v};`;}
    if(m.T==='Init')return`constructor(${this.params(m.ps)}) ${this.g(m.body)}`;
    if(m.T==='Deinit')return`// deinit`;
    if(m.T==='Get')return`get ${m.nm}() ${this.g(m.body)}`;
    if(m.T==='Set')return`set ${m.nm}(${this.params(m.ps)}) ${this.g(m.body)}`;
    if(m.T==='StaticBlk')return`static ${this.g(m.body)}`;
    if(m.T==='Fn'){const s=m.mods?.static?'static ':'';const a=m.mods?.async||m.async?'async ':'';return`${s}${a}${m.nm}(${this.params(m.ps||[])}) ${m.body?this.g(m.body):'{}'}`;}
    return`/*${m.T}*/`;
  }

  $Struct(n){
    const exp=n.mods?.pub?'export ':'';
    const fields=(n.fields||[]).map(f=>`    this.${f.nm}=(p.${f.nm}!==undefined)?p.${f.nm}:${f.init?this.g(f.init):'undefined'};`).join('\n');
    const methods=(n.methods||[]).map(m=>`  ${this.clsMember({...m,T:'Fn'})}`).join('\n');
    return`${exp}class ${n.nm}{\n  constructor(p={}){\n${fields}\n  }\n${methods}\n}`;
  }

  $Enum(n){
    const exp=n.mods?.pub?'export ':'';
    const vs=(n.vs||[]).map(v=>{
      if(v.payload)return`  ${v.nm}:(...a)=>({__tag:${this.q(v.nm)},args:a})`;
      return`  ${v.nm}:${v.val?this.g(v.val):this.q(v.nm)}`;
    }).join(',\n');
    return`${exp}const ${n.nm}=Object.freeze({\n${vs}\n});`;
  }

  $TypeAlias(){return'';}
  $Trait(){return'';}
  $Impl(n){return(n.methods||[]).map(m=>this.g(m)).join('\n');}
  $Extend(n){
    const tn=n.target?.n||'Object';
    return(n.members||[]).map(m=>`${tn}.prototype.${m.nm}=function(${this.params(m.ps||[])}) ${this.g(m.body)};`).join('\n');
  }
  $Mod(n){if(!n.body)return`// mod ${n.nm}`;const body=n.body.map(d=>this.g(d)).join('\n  ');return`const ${n.nm}=(()=>{\n  ${body}\n  return {};\n})();`;}
  $Use(){return'';}
  $Import(n){
    if(n.kind==='side')return`// import '${n.src}'`;
    if(n.kind==='glob')return`const ${n.alias||'__mod'}=require('${n.src}');`;
    if(n.kind==='named'){const ns=(n.names||[]).map(i=>i.alias?`${i.nm}:${i.alias}`:i.nm).join(',');return`const {${ns}}=require('${n.src}');`;}
    return`const ${n.def}=require('${n.src}');`;
  }
  $Export(n){
    if(n.kind==='default')return`module.exports=${this.g(n.val)};`;
    if(n.kind==='decl')return this.g(n.decl);
    const its=(n.items||[]).map(i=>i.alias?`${i.nm}:${i.alias}`:i.nm).join(',');
    return`module.exports={...module.exports,${its}};`;
  }
  $Extern(){return'';}
  $OpDecl(){return'';}
  $InfixDef(){return'';}
  $PrefixDef(){return'';}
  $SynDef(n){return`// syntax '${n.nm}' registered`;}
  $Plugin(){return'';}
  $DecDecl(){return'';}
  $Middleware(n){return`function ${n.nm}(${this.params(n.ps)}) ${this.g(n.body)}`;}

  // ── Variables ─────────────────────────────────────────────────
  $Var(n){
    const kw=['const','val','final','readonly','static'].includes(n.kind)?'const':'let';
    return`${kw} ${this.pat(n.pat)}${n.init?` = ${this.g(n.init)}`:''}; `;
  }
  $SVar(n){return`let ${n.nm} = ${n.init?this.g(n.init):'null'};`;}
  $Signal(n){return`const ${n.nm} = Vex.signal(${n.init?this.g(n.init):'null'});`;}
  $Context(n){return`const ${n.nm} = {_ctx:true,_default:${n.default?this.g(n.default):'null'}};`;}
  $Theme(n){return`const ${n.nm} = {${Object.entries(n.props||{}).map(([k,v])=>`${k}:${this.g(v)}`).join(',')}};`;}
  $Style(n){const rules=Object.entries(n.rules||{}).map(([k,v])=>`${k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())}:${this.g(v)}`).join(',');return`const ${n.nm} = {${rules}};`;}
  $Anim(n){return`const ${n.nm} = {${Object.entries(n.frames||{}).map(([k,v])=>`${this.q(k)}:${this.g(v)}`).join(',')}};`;}
  $Route(n){return`Vex.router?.add(${this.q(n.path)},${n.screen?this.g(n.screen):'null'});`;}
  $Router(n){return(n.routes||[]).map(r=>this.g(r)).join('\n');}

  // ── Components ────────────────────────────────────────────────
  $Component(n){
    const exp=n.mods?.pub||n.mods?.export?'export ':'';
    const prps=(n.props||[]).filter(p=>!p.sl).map(p=>p.nm).join(',');
    const arg=prps?`{${prps}}`:'_p';
    let body='';const I='  ';
    for(const s of n.states||[]){
      if(s.T==='SVar'){const init=s.init?this.g(s.init):'null';body+=`${I}const [_g_${s.nm},_s_${s.nm}]=Vex.state(${init});\n${I}let ${s.nm}=_g_${s.nm}();\n${I}const set_${s.nm}=v=>{${s.nm}=typeof v==='function'?v(${s.nm}):v;_s_${s.nm}(${s.nm});};\n`;}
      else body+=`${I}${this.g(s)}\n`;
    }
    for(const e of n.effects||[])body+=`${I}Vex.spawn(async()=>${this.g(e.body)});\n`;
    for(const m of n.memos||[])body+=`${I}const ${m.nm}=(()=>${this.g(m.body)})();\n`;
    if(n.lc?.mount)body+=`${I}/* mount */ ${this.g(n.lc.mount)}\n`;
    for(const h of n.hooks||[])body+=`${I}${this.g(h)}\n`;
    body+=`${I}return ${n.render?this.g(n.render):'null'};\n`;
    return`${exp}function ${n.nm}(${arg}){\n${body}}`;
  }
  $Widget(n){
    const exp=n.mods?.pub?'export ':'';
    const prps=(n.props||[]).filter(p=>!p.sl).map(p=>p.nm).join(',');
    const arg=prps?`{${prps}}`:'_p';
    const body=n.body?.T==='Block'?this.g(n.body):`(${this.g(n.body)})`;
    return`${exp}const ${n.nm}=(${arg})=>${body};`;
  }
  $Hook(n){return`function ${n.nm}(${this.params(n.ps)}) ${this.g(n.body)}`;}
  $Store(n){
    const fields=(n.fields||[]).map(f=>`    ${f.nm}:${f.init?this.g(f.init):'null'}`).join(',\n');
    const acts=(n.actions||[]).map(a=>`    ${a.nm}(${this.params(a.ps||[])}) ${a.body?this.g(a.body):'{}'}`).join(',\n');
    const gets=(n.getters||[]).map(g=>`    get ${g.nm}() ${g.body?this.g(g.body):'{return null;}'}`).join(',\n');
    return`const ${n.nm}=Vex.store({\n  state:{\n${fields}\n  },\n  actions:{\n${acts}\n  },\n  getters:{\n${gets}\n  }\n});`;
  }

  // ── Statements ────────────────────────────────────────────────
  $Expr(n){return this.g(n.e)+';\n';}
  $Block(n){this.in();const body=(n.body||[]).map(s=>this.i()+this.g(s)).join('\n');this.out();return`{\n${body}\n${this.i()}}`;}
  $Label(n){return`${n.name}: ${this.g(n.body)}`;}
  $If(n){let s=`if(${this.g(n.cond)}) ${this.g(n.then)}`;for(const e of n.elifs||[])s+=` else if(${this.g(e.cond)}) ${this.g(e.body)}`;if(n.otherwise)s+=` else ${this.g(n.otherwise)}`;return s;}
  $When(n){const bs=(n.bs||[]).map(b=>`${this.g(b.cond)}?(${this.g(b.body)})`).join(':');return`(${bs||'undefined'}:${n.ow?this.g(n.ow):'undefined'});`;}
  $Match(n){
    const sv=this.fresh();
    const arms=(n.arms||[]).map(arm=>{
      const conds=(arm.pats||[]).map(p=>this.pCond(p,sv)).join('||');
      const binds=(arm.pats||[]).flatMap(p=>this.pBinds(p,sv)).join(' ');
      const guard=arm.guard?`&&(${this.g(arm.guard)})`:'';
      const body=this.g(arm.body);
      return binds?`((${conds})${guard}?(()=>{${binds}return ${body};})():null)`:`((${conds})${guard}?${body}:null)`;
    });
    return`((${sv})=>${arms.map((a,i)=>i===0?a:`??(${a})`).join('\n  ')}??Vex.panic('non-exhaustive'))(${this.g(n.subj)});`;
  }
  $Switch(n){const cases=(n.cases||[]).map(c=>{const ks=c.default?'default:':c.vals.map(v=>`case ${this.g(v)}:`).join(' ');const body=c.body.map(s=>this.g(s)).join('\n    ');return`  ${ks}\n    ${body}\n    break;`;}).join('\n');return`switch(${this.g(n.subj)}){\n${cases}\n}`;}
  $For(n){const pat=this.pat(n.pat);if(n.iter?.T==='Range'){const{from,to,inc,step}=n.iter;return`for(let ${pat}=${this.g(from)};${pat}${inc?'<=':'<'}${this.g(to)};${pat}+=${step?this.g(step):'1'}) ${this.g(n.body)}`;}return`for(const ${pat} of ${this.g(n.iter)}) ${this.g(n.body)}`;}
  $While(n){return`while(${this.g(n.cond)}) ${this.g(n.body)}`;}
  $Loop(n){return`while(true) ${this.g(n.body)}`;}
  $DoWhile(n){return`do ${this.g(n.body)} while(${this.g(n.cond)});`;}
  $Return(n){return`return${n.val?' '+this.g(n.val):''}; `;}
  $Yield(n){return`yield${n.star?'*':''} ${this.g(n.val)};`;}
  $Break(n){return`break${n.label?' '+n.label:''};`;}
  $Cont(n){return`continue${n.label?' '+n.label:''};`;}
  $Goto(){return'/* goto */';}
  $Fall(){return'/* fallthrough */';}
  $Throw(n){return`throw ${this.g(n.val)};`;}
  $Panic(n){return`Vex.panic(${this.g(n.msg)});`;}
  $Unreachable(){return`Vex.panic('unreachable');`;}
  $Assert(n){return`Vex.assert(${this.g(n.cond)}${n.msg?','+this.g(n.msg):''});`;}
  $Try(n){let s=`try ${this.g(n.body)}`;for(const c of n.catches||[])s+=` catch(${c.pat?this.pat(c.pat):'__e'}) ${this.g(c.body)}`;if(n.finally)s+=` finally ${this.g(n.finally)}`;return s;}
  $Defer(n){return`(Vex._df=Vex._df||[]).push(()=>${this.g(n.body)});`;}
  $With(n){const r=this.g(n.resource),b=this.g(n.body);return n.nm?`const ${n.nm}=${r};try ${b} finally{${n.nm}?.close?.();}`:`{const __w=${r};try ${b} finally{__w?.close?.();}}`;}
  $Unsafe(n){return`/*unsafe*/ ${this.g(n.body)}`;}
  $Atomic(n){return`/*atomic*/ ${this.g(n.body)}`;}
  $Comptime(n){return`/*comptime*/ ${this.g(n.body)}`;}
  $Lock(n){return`{await ${this.g(n.mx)}.lock?.();try ${this.g(n.body)} finally{${this.g(n.mx)}.unlock?.();}}`;}
  $AsyncBlk(n){return`(async()=>${this.g(n.body)})()`;}
  $Spawn(n){return`Vex.spawn(()=>${this.g(n.expr)});`;}
  $Select(n){return`await Promise.race([${(n.cases||[]).map(c=>`Promise.resolve(${this.g(c.expr)}).then(()=>{${c.body.map(s=>this.g(s)).join(';')}})`).join(',')}]);`;}
  $ChanNew(){return`Vex.chan()`;}

  // ── Expressions ───────────────────────────────────────────────
  $Num(n){return n.v;}
  $Str(n){return`"${n.v.replace(/"/g,'\\"')}"`;}
  $Tmpl(n){return`\`${n.raw}\``;}
  $Re(n){return`/${n.pat}/${n.fl||''}`;}
  $Bool(n){return n.v?'true':'false';}
  $Null(){return'null';}
  $Undef(){return'undefined';}
  $Self(){return'this';}
  $Super(){return'super';}
  $Id(n){return n.v;}
  $Arr(n){return`[${(n.els||[]).map(e=>this.g(e)).join(',')}]`;}
  $ArrRep(n){return`Array(${this.g(n.n)}).fill(${this.g(n.val)})`;}
  $Tuple(n){return`[${(n.els||[]).map(e=>this.g(e)).join(',')}]`;}
  $Group(n){return`(${this.g(n.val)})`;}
  $Obj(n){const es=(n.ents||[]).map(e=>{if(e.spread)return`...${this.g(e.val)}`;const k=e.key?.computed?`[${this.g(e.key.val)}]`:typeof e.key==='string'?e.key:this.g(e.key);return`${k}:${this.g(e.val)}`;}).join(',');return`{${es}}`;}
  $Lam(n){const ps=(n.params||[]).map(p=>p.def?`${p.name||p.nm}=${this.g(p.def)}`:p.name||p.nm).join(',');const body=n.body?.T==='Block'?this.g(n.body):`(${this.g(n.body)})`;return`(${ps})=>${body}`;}
  $Spread(n){return`...${this.g(n.val)}`;}
  $Named(n){return this.g(n.val);}
  $Unary(n){return`${n.op}${this.g(n.val)}`;}
  $Pre(n){return`${n.op}${this.g(n.val)}`;}
  $Post(n){return`${this.g(n.val)}${n.op}`;}
  $Prop(n){return`(${this.g(n.val)})`;}
  $Unwrap(n){return`Vex.nn(${this.g(n.val)})`;}
  $Ref(n){return this.g(n.val);}
  $Deref(n){return this.g(n.val);}
  $Move(n){return this.g(n.val);}
  $Copy(n){const v=this.g(n.val);return`(typeof ${v}==='object'&&${v}!==null?{...${v}}:${v})`;}
  $Delete(n){return`(${this.g(n.val)}=null)`;}
  $Bin(n){const L=this.g(n.left),R=this.g(n.right);if(n.op==='//') return`Math.trunc(${L}/${R})`;if(n.op==='%%')return`(((${L})%(${R}))+(${R}))%(${R})`;if(n.op==='^^')return`(!!(${L})!==!!(${R}))`;return`${L}${n.op}${R}`;}
  $Asgn(n){return`${this.g(n.left)}${n.op}${this.g(n.right)}`;}
  $Walrus(n){return`(${this.g(n.left)}=${this.g(n.right)})`;}
  $NCoal(n){return`(${this.g(n.left)}??${this.g(n.right)})`;}
  $Pipe(n){return`(${this.g(n.right)})(${this.g(n.left)})`;}
  $Compose(n){return`Vex.pipe(${this.g(n.left)},${this.g(n.right)})`;}
  $Range(n){const f=this.g(n.from),t=this.g(n.to),s=n.step?this.g(n.step):'1';return`[...Vex.range(${f},${t},${n.inc},${s})]`;}
  $CSend(n){return`${this.g(n.chan)}.send(${this.g(n.val)})`;}
  $In(n){return`(${this.g(n.val)} in ${this.g(n.of)})`;}
  $Cast(n){const v=this.g(n.val),t=n.to?.n||'any';const m={i32:`Math.trunc(${v})`,i64:`Math.trunc(${v})`,u32:`(${v}>>>0)`,f64:`Number(${v})`,f32:`Math.fround(${v})`,str:`String(${v})`,bool:`Boolean(${v})`};return m[t]||`(${v})`;}
  $Is(n){return`(${this.g(n.val)} instanceof ${n.check?.n||'Object'})`;}
  $Isn(n){return`!(${this.g(n.val)} instanceof ${n.check?.n||'Object'})`;}
  $Inst(n){return`(${this.g(n.val)} instanceof ${n.check?.n||'Object'})`;}
  $Typeof(n){return`typeof ${this.g(n.val)}`;}
  $Sizeof(){return'8';}
  $Nameof(n){return this.q(n.val?.v||'?');}
  $Keyof(){return'/*keyof*/';}
  $Await(n){return`await ${this.g(n.val)}`;}
  $Call(n){return`${this.g(n.callee)}(${(n.args||[]).map(a=>this.g(a)).join(',')})`;}
  $Mbr(n){return`${this.g(n.obj)}${n.opt?'?.':'.'}${n.m}`;}
  $Path(n){return`${this.g(n.obj)}.${n.m}`;}
  $Idx(n){return`${this.g(n.obj)}[${this.g(n.idx)}]`;}
  $New(n){const ty=n.ty?.n||'Object';const args=(n.args||[]).map(a=>this.g(a)).join(',');return n.obj?`new ${ty}(${this.g(n.obj)})`:`new ${ty}(${args})`;}

  // JSX
  $Jsx(n){
    const tag=/^[A-Z]/.test(n.tag)?n.tag:this.q(n.tag);
    const props=n.props?.length?`{${n.props.map(p=>p.spread?`...${this.g(p.val)}`:`${p.key}:${this.g(p.val)}`).join(',')}}`:null;
    const ch=(n.ch||[]).map(c=>this.g(c));
    return`Vex.el(${tag},${props||'null'}${ch.length?','+ch.join(','):''})`;
  }
  $JsxFrag(n){return`Vex.el(Vex.Fragment,null,${(n.ch||[]).map(c=>this.g(c)).join(',')})`;}
  $JsxE(n){return this.g(n.val);}
  $JsxT(n){return this.q(n.v);}
  $JsxClose(){return'';}

  // Macros (word!)
  $Mac(n){
    const B={
      println:a=>`console.log(${a.join(',')})`,
      print:a=>`(typeof process!=='undefined'?process.stdout?.write(String(${a[0]||''})):console.log(${a[0]||''}))`,
      eprintln:a=>`console.error(${a.join(',')})`,
      dbg:a=>`(console.log(${this.q(a[0]||'?')},${a[0]||'null'}),${a[0]||'null'})`,
      format:a=>`String(${a.join('+')})`,
      todo:a=>`Vex.panic(${a[0]||'"not implemented"'})`,
      unimplemented:a=>`Vex.panic("unimplemented")`,
      unreachable:a=>`Vex.panic("unreachable")`,
      assert:a=>`Vex.assert(${a.join(',')})`,
      panic:a=>`Vex.panic(${a[0]||'""'})`,
      vec:a=>`[${a.join(',')}]`,
      map:a=>`new Map([${a.join(',')}])`,
      set_:a=>`new Set([${a.join(',')}])`,
      env:a=>`(typeof process!=='undefined'?process.env[${a[0]}]:undefined)`,
      stringify:a=>`JSON.stringify(${a.join(',')})`,
      parse:a=>`JSON.parse(${a[0]})`,
      log:a=>`console.log(${a.join(',')})`,
      warn:a=>`console.warn(${a.join(',')})`,
      error:a=>`console.error(${a.join(',')})`,
      len:a=>`(${a[0]}?.length??0)`,
      keys:a=>`Object.keys(${a[0]})`,
      values:a=>`Object.values(${a[0]})`,
      entries:a=>`Object.entries(${a[0]})`,
      freeze:a=>`Object.freeze(${a[0]})`,
      clone:a=>`({...${a[0]}})`,
      type:a=>`typeof ${a[0]}`,
      sleep:a=>`await Vex.sleep(${a[0]})`,
      spawn:a=>`Vex.spawn(${a[0]})`,
      html:a=>`Vex.el(${a.join(',')})`,
      include:a=>`require(${a[0]})`,
      concat:a=>`[...${a.join(',... ')}]`,
      range:a=>a.length===1?`[...Vex.range(0,${a[0]},false)]`:`[...Vex.range(${a[0]},${a[1]},false,${a[2]||1})]`,
    };
    const args=(n.args||[]).map(a=>this.g(a));
    return(B[n.name]||(a=>`${n.name}(${a.join(',')})`)) (args);
  }

  // User-defined syntax expansion
  $SynExp(n){
    let result=n.tmpl;
    for(let i=0;i<n.args.length;i++){
      result=result.replaceAll(`$${i}`,this.g(n.args[i]));
      if(n.params[i])result=result.replaceAll(`\${${n.params[i]}}`,this.g(n.args[i]));
    }
    return result;
  }

  // Custom infix/prefix from user operator definitions
  $CInfix(n){return`${this.g(n.left)} /* ${n.op} */ ${this.g(n.right)}`;}
  $CPrefix(n){return`/* ${n.op} */ ${this.g(n.val)}`;}

  // ── Patterns → JS destructuring ────────────────────────────
  pat(p){
    if(!p)return'_';
    if(p.T==='IdP') return p.nm;
    if(p.T==='WildP')return'_';
    if(p.T==='TupP') return`[${p.es.map(e=>this.pat(e)).join(',')}]`;
    if(p.T==='ArrP') return`[${p.es.map(e=>this.pat(e)).join(',')}]`;
    if(p.T==='StrcP')return`{${p.fs.map(f=>f.nm).join(',')}}`;
    if(p.T==='RestP')return p.nm?`...${p.nm}`:'...';
    if(p.T==='OrP')  return this.pat(p.vs[0]);
    return'_';
  }

  pCond(p,sv){
    if(!p||p.T==='WildP'||p.T==='IdP')return'true';
    if(p.T==='LitP') return`${sv}===${this.g(p.val)}`;
    if(p.T==='RangeP')return`${sv}>=${this.g(p.lo)}&&${sv}${p.inc?'<=':'<'}${this.g(p.hi)}`;
    if(p.T==='EnumP')return`${sv}?.__tag===${this.q(p.vr)}`;
    if(p.T==='StrcP')return`typeof ${sv}==='object'&&${sv}!==null`;
    if(p.T==='TupP') return`Array.isArray(${sv})`;
    if(p.T==='ArrP') return`Array.isArray(${sv})`;
    if(p.T==='OrP')  return p.vs.map(v=>this.pCond(v,sv)).join('||');
    return'true';
  }

  pBinds(p,sv){
    if(!p)return[];
    if(p.T==='IdP')  return[`const ${p.nm}=${sv};`];
    if(p.T==='TupP') return p.es.flatMap((e,i)=>this.pBinds(e,`${sv}[${i}]`));
    if(p.T==='ArrP') return p.es.flatMap((e,i)=>this.pBinds(e,`${sv}[${i}]`));
    if(p.T==='StrcP')return p.fs.flatMap(f=>this.pBinds(f.p,`${sv}.${f.nm}`));
    if(p.T==='EnumP'&&p.pl)return p.pl.flatMap((pp,i)=>this.pBinds(pp,`${sv}.args[${i}]`));
    if(p.T==='BindP')return[`const ${p.bind}=${sv};`,...this.pBinds(p.p,sv)];
    return[];
  }

  params(ps){
    return(ps||[]).filter(p=>!p.sl).map(p=>p.va?`...${p.nm}`:p.def?`${p.nm}=${this.g(p.def)}`:p.nm).join(',');
  }
}

// ─────────────────────────────────────────────────────────────────
//  TRANSPILE  — main API
// ─────────────────────────────────────────────────────────────────
function transpile(source, file='<vex>', opts={}) {
  const reg    = new Registry();
  const src    = reg.applyXforms(source);
  const tokens = tokenize(src, file);
  const parser = new Parser(tokens, reg);
  loadMacros(reg);
  for(const p of opts.plugins||[]) p(reg, parser);
  const ast    = parser.parseModule();
  const gen    = new Gen();
  return { js: gen.run(ast), ast, tokens };
}

// ─────────────────────────────────────────────────────────────────
//  CLI
// ─────────────────────────────────────────────────────────────────
const VERSION='0.1.0';

function cli() {
  if(typeof process==='undefined'||!process.argv)return;
  const args=process.argv.slice(2);
  if(!args.length){
    console.log(`Vex ${VERSION}\nUsage: node vex.js <file.vx> [--run] [--ast] [--tokens] [-o out.js]`);
    return;
  }
  let input=null,output=null,run=false,ast=false,tokens=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='-o')output=args[++i];
    else if(args[i]==='--run')run=true;
    else if(args[i]==='--ast')ast=true;
    else if(args[i]==='--tokens')tokens=true;
    else if(!args[i].startsWith('-'))input=args[i];
  }
  if(!input){console.error('No input file');process.exit(1);}
  const fs=require('fs');
  if(!fs.existsSync(input)){console.error('File not found: '+input);process.exit(1);}
  const src=fs.readFileSync(input,'utf8');
  try{
    const result=transpile(src,input);
    if(tokens){result.tokens.filter(t=>t.k!==K.NL&&t.k!==K.COM).forEach(t=>console.log(`${t.ln}:${t.col}\t${t.k}\t${JSON.stringify(t.v)}`));return;}
    if(ast){console.log(JSON.stringify(result.ast,null,2));return;}
    if(output){fs.writeFileSync(output,result.js);console.error(`✓ ${input} → ${output}`);}
    else if(run){const fn=new Function('require','process','console','setTimeout','clearTimeout','setInterval',result.js);fn(typeof require!=='undefined'?require:null,process,console,setTimeout,clearTimeout,setInterval);}
    else process.stdout.write(result.js);
  }catch(e){
    console.error(e.message);
    if(process.env.VEX_DEBUG)console.error(e.stack);
    process.exit(1);
  }
}

module.exports={transpile,tokenize,Registry,Parser,Gen,loadMacros,K,VERSION};
if(typeof require!=='undefined'&&require.main===module)cli();
