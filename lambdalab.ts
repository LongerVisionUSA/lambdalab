/**
 * The Web interface.
 */
import { parse, ParseError, Scanner, add_macro } from './lib/parse';
import { pretty, Expr, Var, App, Abs, Macro, StepInfo, convertToDot } from './lib/ast';
import { run, reduce_cbv, reduce_cbn, reduce_appl, reduce_normal,
         Strategy, strat_of_string } from './lib/reduce';
import { resugar, MacroDefinition, getDependencies } from './lib/macro';

/**
 * How many reduction steps to execute before timing out?
 */
export const TIMEOUT = 100;

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

function renderAST(e : Expr) {
  let Viz = require('viz.js');
  let dotAST = convertToDot(e);
  let svg = Viz(dotAST);

  let graphOut = document.getElementById("graph_output")!;
  let graphContent : SVGElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  graphContent.setAttribute("overflow", "auto");
  graphContent.innerHTML = svg;

  // Clear the old contents.
  let range = document.createRange();
  range.selectNodeContents(graphOut);
  range.deleteContents();

  graphOut.appendChild(graphContent);
}

/**
 * Execute a lambda-calculus expression in a string. Return a new set of steps
 * to display or a parse error.
 */
function runCode(scanner: Scanner, strategy : Strategy): string[] | ParseError {
  let expr;
  try {
    expr = parse(scanner, strategy);
  } catch (e) {
    if (e instanceof ParseError) {
      return e;
    } else {
      throw(e);
    }
  }

  // Determine the selected reduction strategy
  let reduce = reduce_cbv;
  if (strategy === Strategy.CBN)
    reduce = reduce_cbn;
  if (strategy === Strategy.Normal)
    reduce = reduce_normal;
  if (strategy === Strategy.Appl)
    reduce = reduce_appl;

  // TODO: generalize this to print each line of the results as a tree
  if (expr) {
    renderAST(expr);
  }
  
  let [steps, e] = run(expr, TIMEOUT, reduce);
  if (e) { // Timeout did not occur 
    let [new_e, sugared] = resugar(e, scanner.macro_lookup, strategy);
    if (sugared) {
      // the last resugaring step counts as a macro-equivalent replacement
      steps.push("=\xa0\xa0\xa0" + pretty(new_e, null));
    }
  }
  return steps;
}

/**
 * Hide an HTML element from the page by setting "display: none" in its CSS.
 */
function hide(el: HTMLElement) {
  el.style.display = 'none';
}

function colorize(entry : HTMLLIElement, line : string) : HTMLLIElement {
  while (true) { // will eventually terminate when no more < is found
    let pos = 0;
    pos = line.indexOf("<");
    if (pos === -1) {
      let span = document.createElement("span");
      span.textContent = line;
      entry.appendChild(span);
      return entry;
    }

    let between = line.slice(0, pos); // text between color tags
    let span_between = document.createElement("span");
    span_between.textContent = between;
    entry.appendChild(span_between);

    line = line.slice(pos+1);
    let span_within = document.createElement("span");
    if (line.charAt(0) === 'a') { // active abstraction/variable/macro
      span_within.className = "active_abs"
    } else if (line.charAt(0) === 's') { // active substitution target
      span_within.className = "active_subst"
    }
    line = line.slice(2); // trim off "x>"

    pos = line.indexOf("<");
    let within = line.slice(0, pos); // text inside color tag
    span_within.textContent = within;
    entry.appendChild(span_within);
    line = line.slice(pos+4); // trim off </x>
  }
}

/**
 * Show the result, given as a string, of executing some code in the list
 * element provided.
 *
 * Currently, this empties out the list and adds a single element with the
 * result string. Eventually, this should be able to add many <li>s to show
 * the process of beta-reduction.
 */
function showResult(res: ReadonlyArray<string>,
                    resultList: HTMLElement, helpText: HTMLCollectionOf<Element>) {
  // Hide the help text on first successful execution.
  for (let i = 0; i < helpText.length; ++i) {
    hide(helpText[i] as HTMLElement);
  }

  // Clear the old contents.
  let range = document.createRange();
  range.selectNodeContents(resultList);
  range.deleteContents();

  for (let line of res) {
    let entry = document.createElement("li");
    resultList.appendChild(colorize(entry, line));
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
  let messageName = errorBox.id + "Message";
  let msgBox = document.getElementById(messageName)!;
  msgBox.innerText = error.msg;
}

/**
 * Remove the current error being displayed.
 */
function clearError(errorBox: HTMLElement) {
  errorBox.style['display'] = 'none';
}

/**
 * Update the sharing link with the current code.
 */
function updateLink(code: string, strategy: number,
                    shareLink: HTMLInputElement) {
  let state = { code, strategy };
  let state_str = encodeURIComponent(JSON.stringify(state));
  let base_url = window.location.href.replace(window.location.hash, "");
  let share_url = base_url + '#' + state_str;
  console.log(share_url);
  shareLink.value = share_url;
}

/**
 * Load the current state from a URL hash, if it contains share link data.
 *
 * Return a flag indicating whether code was loaded from the state.
 */
function handleHash(hash: string, programBox: HTMLElement,
                    strategies: NodeListOf<HTMLInputElement>): boolean {
  let json = decodeURIComponent(hash.substr(1));
  if (!json) {
    return false;
  }

  // Parse the JSON.
  let state;
  try {
    state = JSON.parse(json);
  } catch (e) {
    return false;
  }

  // Load the code.
  let foundCode = false;
  if (state.code) {
    programBox.textContent = state.code;
    foundCode = true;
  }

  // Load the evaluation strategy.
  if (state.strategy) {
    for (let i = 0; i < strategies.length; i++) {
      if (strat_of_string(strategies[i].value) === state.strategy) {
        strategies[i].checked = true;
        break;
      }
    }
  }

  return foundCode;
}

/**
 * Set up the program event handlers. This is called when the DOM is first
 * loaded.
 *
 * Return a function that runs the currently-entered program, as if the user
 * had just entered it manually.
 */
function programSetUp(programBox: HTMLElement, resultList: HTMLElement,
               strategies: NodeListOf<HTMLInputElement>, scanner: Scanner,
               helpText: HTMLCollectionOf<Element>, errorBox: HTMLElement,
               shareLink: HTMLInputElement) {

  // Run the code currently entered into the box.
  function execute() {
    // Get the code to execute.
    let code = programBox.textContent!;
    if (!code.trim()) {
      // No code: do nothing.
      clearError(errorBox);
      return;
    }

    // Determine the evaluation strategy.
    let strategy = null;
    for (let i = 0; i < strategies.length; i++) {
      if (strategies[i].checked) {
        strategy = strat_of_string(strategies[i].value);
      }
    }
    if(!strategy) return;

    // Update the sharing link.
    updateLink(code, strategy, shareLink);

    // Parse and execute.
    scanner.set_string(code);
    let result = runCode(scanner, strategy);
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

  return execute;
}


/**
 * Sort the list of macros by dependency. Returns the sorted list 
 */
function sortMacros(scanner : Scanner) {
  let macros = Object.keys(scanner.macro_lookup).map(name => scanner.macro_lookup[name]);
  let dependencies = macros.reduce((acc : MacroDefinition[][], macro : MacroDefinition) => 
                                    acc.concat(getDependencies(macro, scanner)), []);
  let toposort = require('toposort');

  let sortedMacros : MacroDefinition[] = toposort.array(macros, dependencies);
  return sortedMacros;
}


/**
 * Update the list of defined macros to display all the macros in the scanner. 
 */

function updateMacroList (sortedMacros : MacroDefinition[], macroList : HTMLElement) {
  // Clear the old contents.
  let range = document.createRange();
  range.selectNodeContents(macroList);
  range.deleteContents();

  sortedMacros.forEach(macro => {
    let entry = document.createElement("li");
    entry.textContent = macro.name + " ≜ " + pretty(macro.unreduced, null)
    macroList.appendChild(entry);
  });
}

/**
 * Set up the macro event handlers. This is called when the DOM is first loaded.
 */
function macroSetUp(macroBox: HTMLElement, resultList: HTMLElement,
  helpText: HTMLCollectionOf<Element>, errorBox: HTMLElement, macroList:HTMLElement) {

  let scanner = new Scanner();
  let sorted = sortMacros(scanner);
  updateMacroList(sorted, macroList);

  // Run the code currently entered into the box.
  function execute() {
    // Parse and execute.
    let code = macroBox.textContent!;
    if (!code.trim()) {
      // No code: do nothing.
      clearError(errorBox);
      return;
    }

    scanner.set_string(code);
    try {
      let old = scanner.copyMacros();
      let [name, result] = add_macro(scanner);
      try {
        let sorted = sortMacros(scanner);
        scanner.recompileMacros(sorted);
        updateMacroList(sorted, macroList);
      }
      catch (e) {
        scanner.macro_lookup = old;
        throw new ParseError("Cannot define circularly dependent macro", 0);
      }
      clearError(errorBox);
      showResult(result, resultList, helpText);
    }
    catch (e)  {
      if (e instanceof ParseError) {
        showError(macroBox, errorBox, e);
      }
      else {
        throw(e);
      }
    }
  }

  // Focus in the code box.
  macroBox.focus();

  macroBox.addEventListener("keypress", (event) => {
    // When the user types \, insert a lambda instead.
    if (event.key === "\\") {
      // Don't insert the \ character.
      event.preventDefault();

      // Instead, we'll insert a lambda.
      insertText("λ");

    } else if (event.key === "=") {
      // Don't insert the = character.
      event.preventDefault();

      // Instead, we'll insert a definition.
      insertText("≜");

    } else if (event.key === "Enter") {
      // Run immediately.
      event.preventDefault();
      execute();
    }
  });

  return scanner;
}

function toggleVisibility(el: HTMLElement) {
  let style = window.getComputedStyle(el);
  if (style.visibility === "hidden") {
    el.style.visibility = "visible";
  } else {
    el.style.visibility = "hidden";
  }
}

// Event handler for document setup.
document.addEventListener("DOMContentLoaded", () => {
  // Select the sharing link (and copy it to the clipboard, when supported) on
  // click.
  let shareLink = document.getElementById("share_link")! as HTMLInputElement;
  shareLink.addEventListener("click", (event) => {
    shareLink.setSelectionRange(0, shareLink.value.length);
    document.execCommand('copy');
  });

  let macroBox = document.getElementById("macro")!;
  let macroResult = document.getElementById("macro_result")!;
  let macroText = document.getElementsByClassName("macro_help");
  let macroErrorBox = document.getElementById("macro_error")!;
  let macroList = document.getElementById("macrolist")!;
  let scanner = macroSetUp(macroBox, macroResult, macroText, macroErrorBox, macroList);

  let programBox = document.getElementById("program")!;
  let strategies = document.getElementsByName("evalStrat")! as NodeListOf<HTMLInputElement>;
  let programResultList = document.getElementById("program_result")!;
  let programHelpText = document.getElementsByClassName("program_help");
  let programErrorBox = document.getElementById("program_error")!;
  let execute = programSetUp(programBox, programResultList, strategies, scanner,
    programHelpText, programErrorBox, shareLink);

  // Show & hide the options box.
  let optionsBox = document.getElementById("options")!;
  let optionsButton = document.getElementById("show_options")!;
  optionsButton.addEventListener("click", (event) => {
    toggleVisibility(optionsBox);
  });

  // Load the state from a pasted sharing link, if any.
  if (handleHash(window.location.hash, programBox, strategies)) {
    execute();
  }
});
