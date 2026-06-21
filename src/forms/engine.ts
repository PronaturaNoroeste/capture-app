// Form engine — visibility (visible_si), conditional-required, and validation.
// Pure functions shared by the renderer and the tests.

import type { Campo, Condicion, Seccion } from './types';

export function evalCond(cond: Condicion | undefined, scope: Record<string, unknown>): boolean {
  if (!cond) return true;
  const actual = scope[cond.campo];
  switch (cond.op) {
    case '==': return actual === cond.valor;
    case '!=': return actual !== cond.valor;
    case 'in': return Array.isArray(cond.valor) && cond.valor.includes(actual as string);
    default: return true;
  }
}

export function campoVisible(campo: Campo, scope: Record<string, unknown>): boolean {
  return evalCond(campo.visible_si, scope);
}

export function seccionVisible(sec: Seccion, scope: Record<string, unknown>): boolean {
  return evalCond(sec.visible_si, scope);
}

export function campoRequerido(campo: Campo, scope: Record<string, unknown>): boolean {
  if (campo.requerido) return true;
  if (campo.requerido_si) return evalCond(campo.requerido_si, scope);
  return false;
}

export interface FieldError { campo: string; mensaje: string; }

// Validate one answer object against a section's visible fields.
export function validateAnswer(campos: Campo[], scope: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  for (const campo of campos) {
    if (!campoVisible(campo, scope)) continue;     // hidden → not validated
    const v = scope[campo.key];
    const empty = v === undefined || v === null || v === '';

    if (campoRequerido(campo, scope) && empty) {
      errors.push({ campo: campo.key, mensaje: `${campo.label} es obligatorio` });
      continue;
    }
    if (empty) continue;

    const val = campo.validacion;
    if (val && (campo.tipo === 'entero' || campo.tipo === 'decimal')) {
      const n = Number(v);
      if (Number.isNaN(n)) errors.push({ campo: campo.key, mensaje: `${campo.label}: número inválido` });
      else if (val.min !== undefined && n < val.min)
        errors.push({ campo: campo.key, mensaje: `${campo.label}: mínimo ${val.min}` });
      else if (val.max !== undefined && n > val.max)
        errors.push({ campo: campo.key, mensaje: `${campo.label}: máximo ${val.max}` });
    }
    if (val?.regex && typeof v === 'string' && !new RegExp(val.regex).test(v))
      errors.push({ campo: campo.key, mensaje: `${campo.label}: formato inválido` });
  }
  return errors;
}
