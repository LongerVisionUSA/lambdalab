/**
 * The Web interface.
 */
import { parse, ParseError, Scanner } from './lib/parse';
import { pretty, Expr, Var, App, Abs, Macro } from './lib/ast';
import { reduce_cbv, reduce_cbn, reduce_full } from './lib/reduce';

/**
 * How many reduction steps to execute before timing out?
 */
const TIMEOUT = 32;

/**
 * Insert text into the DOM at the current selection caret.
 */
function insertText(text: string) {
  let sel = window.getSelection();
  if (sel.getRangeAt && sel.rangeCount) {
    // Remove any current contents.
    let range = sel.getRangeAt(0);
    range.deleteContents();

    // Add the new text to the DOM.
    let node = document.createTextNode(text);
    range.insertNode(node);

    // Put the selection (caret) after the newly-inserted text.
    let newRange = document.createRange();
    newRange.setStartAfter(node);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

/**
 * Execute a lambda-calculus expression in a string. Return a new set of steps
 * to display or a parse error.
 */
function runCode(scanner: Scanner, 
          reduce : (e: Expr) => Var | App | Abs | Macro | null): string[] | ParseError {
  let expr;
  try {
    expr = parse(scanner);
  } catch (e) {
    if (e instanceof ParseError) {
      return e;
    } else {
      throw(e);
    }
  }

  let steps: string[] = [];

  if (!expr) {
    return steps;
  }

  for (let i = 0; i < TIMEOUT; ++i) {
    steps.push(pretty(expr));

    // Take a step, if possible.
    let next_expr = reduce(expr);
    if (!next_expr) {
      break;
    }
    expr = next_expr;
  }

  return steps;
}

/**
 * Hide an HTML element from the page by setting "display: none" in its CSS.
 */
function hide(el: HTMLElement) {
  el.style.display = 'none';
}

/**
 * Show the result, given as a string, of executing some code in the list
 * element provided.
 *
 * Currently, this empties out the list and adds a single element with the
 * result string. Eventually, this should be able to add many <li>s to show
 * the process of beta-reduction.
 */
function showResult(res: ReadonlyArray<string>, resultList: HTMLElement,
                    helpText: HTMLCollectionOf<Element>) {
  // Hide the help text on first successful execution.
  for (let i = 0; i < helpText.length; ++i) {
    hide(helpText[i] as HTMLElement);
  }

  // Clear the old contents.
  let range = document.createRange();
  range.selectNodeContents(resultList);
  range.deleteContents();

  // Add new entries.
  for (let line of res) {
    let entry = document.createElement("li");
    entry.textContent = line;
    resultList.appendChild(entry);
  }
}

/**
 * Given a list of text nodes and an offset into the concatenated text
 * they represent, return the text node where this offset lies and the
 * corresponding offset within that node.
 */
function posInText(nodes: NodeList, pos: number): [Node, number] {
  for (let i = 0; i < nodes.length; ++i) {
    let child = nodes[i];
    if (child instanceof Text) {
      let len = child.data.length;
      if (pos <= len) {
        return [child, pos];
      } else {
        pos -= len;
      }
    } else {
      throw "found non-text node";
    }
  }
  throw "out of range";
}

/**
 * Display a parser error.
 */
function showError(programBox: HTMLElement, errorBox: HTMLElement,
                   error: ParseError) {
  console.log(`parse error in "${programBox.textContent!}" @ ` +
              `${error.pos}: ${error.msg}`);
  
  // Character position to display. If it's past the end of the
  // string (e.g., when a balanced paren is missing), move it
  // back to the last character of the input code.
  let pos = error.pos;
  let codeLength = programBox.innerText.length;
  if (pos >= codeLength) {
    pos = codeLength - 1;
  }

  // Where is the position with the error, visually?
  for (let i = 0; i < programBox.childNodes.length; ++i) {
    let child = programBox.childNodes[i];
  }
  let text = programBox.firstChild!;  // Contents of the box.
  let range = document.createRange();
  let [startNode, startOff] = posInText(programBox.childNodes, pos);
  range.setStart(startNode, startOff);
  let [endNode, endOff] = posInText(programBox.childNodes, pos + 1);
  range.setEnd(endNode, endOff);
  let rect = range.getBoundingClientRect();

  // Place the error indicator there.
  errorBox.style['display'] = 'block';
  errorBox.style.left = rect.left + 'px';
  errorBox.style.top = rect.top + 'px';

  // Set the contents of the error message.
  let msgBox = document.getElementById("errorMessage")!;
  msgBox.innerText = error.msg;
}

/**
 * Remove the current error being displayed.
 */
function clearError(errorBox: HTMLElement) {
  errorBox.style['display'] = 'none';
}

/**
 * Set up the event handlers. This is called when the DOM is first loaded.
 */
function setUp(programBox: HTMLElement, resultList: HTMLElement,
               strategies : NodeListOf<HTMLInputElement>, helpText: HTMLCollectionOf<Element>,
               errorBox: HTMLElement) {

  // Set up the scanner so it falls within the scope of the execute callback
  let scanner = new Scanner();

  // Run the code currently entered into the box.
  function execute() {
    // Parse and execute.
    let code = programBox.textContent!;
    if (!code.trim()) {
      // No code: do nothing.
      clearError(errorBox);
      return;
    }

    scanner.set_string(code);

    let strategy;
    for (var i = 0; i < strategies.length; i++) {
      if (strategies[i].checked) 
        strategy = strategies[i].value;
    }

    // Determine the selected reduction strategy
    let reduce = reduce_cbv;
    if (strategy === "cbn")
      reduce = reduce_cbn;
    if (strategy === "full")
      reduce = reduce_full;

    let result = runCode(scanner, reduce);
    if (result instanceof ParseError) {
      showError(programBox, errorBox, result);
    } else {
      clearError(errorBox);
      showResult(result, resultList, helpText);
    }
  }

  // Focus in the code box.
  programBox.focus();

  programBox.addEventListener("keypress", (event) => {
    // When the user types \, insert a lambda instead.
    if (event.key === "\\") {
      // Don't insert the \ character.
      event.preventDefault();

      // Instead, we'll insert a lambda.
      insertText("λ");

    } else if (event.key === "Enter") {
      // Run immediately.
      event.preventDefault();
      execute();
    }
  });

  programBox.addEventListener("input", (event) => {
    // Run whenever the parse succeeds.
    execute();
  });

  for (var i = 0; i < strategies.length; i++) {
    strategies[i].addEventListener("click", (event) => {
      // Run whenever the evaluation strategy is changed.
      execute();
    });
  }
}

// Event handler for document setup.
document.addEventListener("DOMContentLoaded", () => {
  let programBox = document.getElementById("program")!;
  let strategies = document.getElementsByName("evalStrat")! as NodeListOf<HTMLInputElement>;
  let resultList = document.getElementById("result")!;
  let helpText = document.getElementsByClassName("help");
  let errorBox = document.getElementById("error")!;
  setUp(programBox, resultList, strategies, helpText, errorBox);
});
