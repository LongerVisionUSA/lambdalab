/**
 * A very simple recursive-descent parser for the plain lambda-calculus.
 */
import { Expr, Abs, App, Var } from './ast';

/**
 * A simple tokenization helper that advances an offset in a string.
 */
class Scanner {
  public offset: number;

  constructor(public str: string) {
    this.offset = 0;
  }

  /**
   * Match the regular expression at the current offset, return the match, and
   * advance the current position past the matched string. Or, if the regular
   * expression does not match here, return null.
   */
  scan(re: RegExp): string | null {
    let match = this.str.substring(this.offset).match(re);
    if (!match) {
      // No match at all.
      return null;
    } else if (match.index !== 0) {
      // Not at the beginning of the string.
      return null;
    } else {
      this.offset += match[0].length;
      return match[0];
    }
  }

  /**
   * Check whether the entire string has been consumed.
   */
  done() {
    return this.offset === this.str.length;
  }

  /**
   * Create a ParseError with the given message that refers to the current
   * source position of the parser.
   */
  error(msg: string) {
    return new ParseError(msg, this.offset);
  }
}

/**
 * Parser errors.
 */
export class ParseError {
  constructor(public msg: string, public pos: number) {}
}

/**
 * Scan over any amount of whitespace.
 */
function skip_whitespace(s: Scanner): void {
  s.scan(/\s*/);
}

/**
 * Parse a variable name.
 */
function parse_ident(s: Scanner): string | null {
  return s.scan(/[A-Za-z0-9]+/);
}

/**
 * Parse a sequence of terms separated by whitespace: in other words,
 * a nested hierarchy of applications.
 */
function parse_expr(s: Scanner): Expr {
  skip_whitespace(s);
  let out_term = null;
  while (true) {
    let term = parse_term(s);

    // Could not parse a term here.
    if (!term) {
      if (out_term === null) {
        throw s.error("expected term");
      }
      return out_term;
    }

    // Accumulate the newly-parsed term.
    skip_whitespace(s);
    if (out_term === null) {
      // The first term.
      out_term = term;
    } else {
      // Stack this on as an application.
      out_term = new App(out_term, term);
    }
  }
}

/**
 * Parse a non-application expression: a variable or an abstraction, or a
 * parenthesized expression.
 */
function parse_term(s: Scanner): Expr | null {
  // Try a variable occurrence.
  let vbl = parse_var(s);
  if (vbl) {
    return vbl;
  }

  // Try an abstraction.
  let abs = parse_abs(s);
  if (abs) {
    return abs;
  }

  // Try parentheses.
  if (s.scan(/\(/)) {
    let expr = parse_expr(s);
    if (s.scan(/\)/)) {
      return expr;
    } else {
      throw s.error("unbalanced parentheses");
    }
  }

  // No term here.
  return null;
}

/**
 * Parse a variable occurrence.
 */
function parse_var(s: Scanner): Expr | null {
  let name = parse_ident(s);
  if (name) {
    return new Var(name);
  } else {
    return null;
  }
}

/**
 * Parse a lambda-abstraction.
 */
function parse_abs(s: Scanner): Expr | null {
  // Lambda.
  if (!s.scan(/\\|λ/)) {
    return null;
  }
  skip_whitespace(s);

  // Variable.
  let name = parse_ident(s);
  if (!name) {
    throw s.error("expected variable name after lambda");
  }
  skip_whitespace(s);

  // Dot.
  if (!s.scan(/\./)) {
    throw s.error("expected dot after variable name");
  }
  skip_whitespace(s);

  // Body.
  let body = parse_expr(s);
  return new Abs(name, body);
}

/**
 * Parse a lambda-calculus expression from a string.
 *
 * May throw a `ParseError` when the expression is not a valid term.
 */
export function parse(s: string): Expr {
  let scanner = new Scanner(s);
  let expr = parse_expr(scanner);
  if (scanner.offset < s.length) {
    throw scanner.error("unexpected token");
  }
  return expr;
}
