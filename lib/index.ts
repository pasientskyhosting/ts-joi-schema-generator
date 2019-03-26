// tslint:disable:no-console

import * as commander from "commander";
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// Default suffix appended to generated files.
const defaultSuffix = "-schema";
// Default header prepended to the generated module.
const defaultHeader =
`/**
 * This module was automatically generated by \`ts-joi-schema-generator\`
 */
`;
const ignoreNode = "";

export interface ICompilerOptions {
  ignoreGenerics?: boolean;
  ignoreIndexSignature?: boolean;
  inlineImports?: boolean;
  outDir?: string
  suffix: string
}

// The main public interface is `Compiler.compile`.
export class Compiler {
  public static compile(
      filePath: string,
      options: ICompilerOptions = {ignoreGenerics: false, ignoreIndexSignature: false, inlineImports: false, outDir: undefined, suffix: defaultSuffix},
    ): string {
    const createProgramOptions: ts.CompilerOptions = {target: ts.ScriptTarget.Latest, module: ts.ModuleKind.CommonJS};
    const program = ts.createProgram([filePath], createProgramOptions);
    const checker = program.getTypeChecker();
    const topNode = program.getSourceFile(filePath);
    if (!topNode) {
      throw new Error(`Can't process ${filePath}: ${collectDiagnostics(program)}`);
    }
    return new Compiler(checker, options, topNode).compileNode(topNode);
  }

  private exportedNames: string[] = [];

  constructor(private checker: ts.TypeChecker, private options: ICompilerOptions, private topNode: ts.SourceFile) {}

  private getName(id: ts.Node): string {
    const symbol = this.checker.getSymbolAtLocation(id);
    return symbol ? symbol.getName() : "unknown";
  }

  private indent(content: string): string {
    return content.replace(/\n/g, "\n  ");
  }
  private compileNode(node: ts.Node): string {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier: return this._compileIdentifier(node as ts.Identifier);
      case ts.SyntaxKind.Parameter: return this._compileParameterDeclaration(node as ts.ParameterDeclaration);
      case ts.SyntaxKind.PropertySignature: return this._compilePropertySignature(node as ts.PropertySignature);
      case ts.SyntaxKind.MethodSignature: return this._compileMethodSignature(node as ts.MethodSignature);
      case ts.SyntaxKind.TypeReference: return this._compileTypeReferenceNode(node as ts.TypeReferenceNode);
      case ts.SyntaxKind.FunctionType: return this._compileFunctionTypeNode(node as ts.FunctionTypeNode);
      case ts.SyntaxKind.TypeLiteral: return this._compileTypeLiteralNode(node as ts.TypeLiteralNode);
      case ts.SyntaxKind.ArrayType: return this._compileArrayTypeNode(node as ts.ArrayTypeNode);
      case ts.SyntaxKind.TupleType: return this._compileTupleTypeNode(node as ts.TupleTypeNode);
      case ts.SyntaxKind.UnionType: return this._compileUnionTypeNode(node as ts.UnionTypeNode);
      case ts.SyntaxKind.LiteralType: return this._compileLiteralTypeNode(node as ts.LiteralTypeNode);
      case ts.SyntaxKind.EnumDeclaration: return this._compileEnumDeclaration(node as ts.EnumDeclaration);
      case ts.SyntaxKind.InterfaceDeclaration:
        return this._compileInterfaceDeclaration(node as ts.InterfaceDeclaration);
      case ts.SyntaxKind.TypeAliasDeclaration:
        return this._compileTypeAliasDeclaration(node as ts.TypeAliasDeclaration);
      case ts.SyntaxKind.ExpressionWithTypeArguments:
        return this._compileExpressionWithTypeArguments(node as ts.ExpressionWithTypeArguments);
      case ts.SyntaxKind.ParenthesizedType:
        return this._compileParenthesizedTypeNode(node as ts.ParenthesizedTypeNode);
      case ts.SyntaxKind.ExportDeclaration:
        return this._compileExportDeclaration(node as ts.ExportDeclaration);
      case ts.SyntaxKind.ImportDeclaration:
        return this._compileImportDeclaration(node as ts.ImportDeclaration);
      case ts.SyntaxKind.SourceFile: return this._compileSourceFile(node as ts.SourceFile);
      case ts.SyntaxKind.AnyKeyword: return 'Joi.any()';
      case ts.SyntaxKind.NumberKeyword: return 'Joi.number()';
      case ts.SyntaxKind.ObjectKeyword: return 'Joi.object()';
      case ts.SyntaxKind.BooleanKeyword: return 'Joi.boolean()';
      case ts.SyntaxKind.StringKeyword: return 'Joi.string()';
      case ts.SyntaxKind.SymbolKeyword: return 'Joi.symbol()';
      //case ts.SyntaxKind.ThisKeyword: return '"this"';
      //case ts.SyntaxKind.VoidKeyword: return '"void"';
      case ts.SyntaxKind.UndefinedKeyword: return 'Joi.valid(undefined)';
      case ts.SyntaxKind.NullKeyword: return 'Joi.valid(null)';
      case ts.SyntaxKind.NeverKeyword: return 'Joi.forbidden()';
      case ts.SyntaxKind.IndexSignature:
        return this._compileIndexSignatureDeclaration(node as ts.IndexSignatureDeclaration);
    }
    // Skip top-level statements that we haven't handled.
    if (ts.isSourceFile(node.parent!)) { return ""; }
    throw new Error(`Node ${ts.SyntaxKind[node.kind]} not supported by ts-joi-schema-generator: ` +
      node.getText());
  }

  private compileOptType(typeNode: ts.Node|undefined): string {
    return typeNode ? this.compileNode(typeNode) : 'Joi.any()';
  }

  private _compileIdentifier(node: ts.Identifier): string {
    return node.getText();
  }
  private _compileParameterDeclaration(node: ts.ParameterDeclaration): string {
    const name = this.getName(node.name);
    const isOpt = node.questionToken ? ", optional" : "";
    return `Param('${name}', ${this.compileOptType(node.type)}${isOpt})`;
  }
  private _compilePropertySignature(node: ts.PropertySignature): string {
    const name = this.getName(node.name);
    const prop = this.compileOptType(node.type);
    const value = node.questionToken ? prop : `${prop}.required()`;
    return `'${name}': ${value}`;
  }
  private _compileMethodSignature(node: ts.MethodSignature): string {
    const name = this.getName(node.name);
    //const params = node.parameters.map(this.compileNode, this);
    //const items = [this.compileOptType(node.type)].concat(params);
    return `'${name}': Joi.func().required()`;
    //return `'${name}': Joi.func().required() /*${items.join(", ")})*/`;
  }
  private _compileTypeReferenceNode(node: ts.TypeReferenceNode): string {
    if (!node.typeArguments) {
      /*if (node.typeName.kind === ts.SyntaxKind.QualifiedName) {
        const typeNode = this.checker.getTypeFromTypeNode(node);
        if (typeNode.flags & ts.TypeFlags.EnumLiteral) {
          return `t.enumlit("${node.typeName.left.getText()}", "${node.typeName.right.getText()}")`;
        }
      }*/
      switch (node.typeName.getText()) {
        case 'Date': return 'Joi.date()';
        case 'Buffer': return 'Joi.binary()';
      }
      return `Joi.lazy(() => ${node.typeName.getText()})`;
    } else if (node.typeName.getText() === "Array") {
      return `Joi.array().items(${this.compileNode(node.typeArguments[0])})`;
    } else if (this.options.ignoreGenerics) {
      return 'Joi.any()';
    } else {
      throw new Error(`Generics are not yet supported by ts-joi-schema-generator: ` + node.getText());
    }
  }
  private _compileFunctionTypeNode(node: ts.FunctionTypeNode): string {
    //const params = node.parameters.map(this.compileNode, this);
    //const items = [this.compileOptType(node.type)].concat(params);
    return `Joi.func()`;
    //return `Joi.func() /*${items.join(", ")})*/`;
  }
  private _compileTypeLiteralNode(node: ts.TypeLiteralNode): string {
    const members = node.members.map((n) => "  " + this.indent(this.compileNode(n)) + ",\n");
    return `Joi.object().keys({\n${members.join("")}})`;
  }
  private _compileArrayTypeNode(node: ts.ArrayTypeNode): string {
    return `Joi.array().items(${this.compileNode(node.elementType)})`;
  }
  private _compileTupleTypeNode(node: ts.TupleTypeNode): string {
    const members = node.elementTypes.map(this.compileNode, this);
    return `Joi.array().ordered(${members.join(", ")})`;
  }
  private _compileUnionTypeNode(node: ts.UnionTypeNode): string {
    const members = node.types.map(this.compileNode, this);
    return `Joi.alternatives(${members.join(", ")})`;
  }
  private _compileLiteralTypeNode(node: ts.LiteralTypeNode): string {
    return `Joi.valid(${node.getText()})`;
  }
  private _compileEnumDeclaration(node: ts.EnumDeclaration): string {
    if (!this.hasTag(node, 'schema')) {
      return ''
    }
    
    const name = this.getName(node.name);
    //const members: string[] = node.members.map(m =>
    //  `  "${this.getName(m.name)}": ${getTextOfConstantValue(this.checker.getConstantValue(m))},\n`);
    const values: string[] = node.members.map(m => getTextOfConstantValue(this.checker.getConstantValue(m)))
    this.exportedNames.push(name);
    return `export const ${name} = Joi.valid(${values.join(', ')}).strict();`;
  }
  private _compileInterfaceDeclaration(node: ts.InterfaceDeclaration): string {
    if (!this.hasTag(node, 'schema')) {
      return ''
    }

    const name = this.getName(node.name);
    const members = node.members
      .map((n) => this.compileNode(n))
      .filter((n) => n !== ignoreNode)
      .map((n) => "  " + this.indent(n) + ",\n");
    const extend: string[] = [];
    if (node.heritageClauses) {
      for (const h of node.heritageClauses) {
        extend.push(...h.types.map(this.compileNode, this));
      }
    }
    
    // has array, unsupported, just don't generate stuff
    if (extend.indexOf('Array') !== -1) {
        return ''
    }

    this.exportedNames.push(name);
    const concats = extend.map((extend) => `.concat(${extend})`);
    return `export const ${name} = Joi.object()${concats.join('')}.keys({\n${members.join("")}}).strict();`;
  }
  private _compileTypeAliasDeclaration(node: ts.TypeAliasDeclaration): string {
    if (!this.hasTag(node, 'schema')) {
      return ''
    }

    const name = this.getName(node.name);
    this.exportedNames.push(name);
    const compiled = this.compileNode(node.type);
    // Turn string literals into explicit `name` nodes, as expected by ITypeSuite.
    const fullType = compiled.startsWith('"') ? `Joi.valid(${compiled})` : compiled;
    return `export const ${name} = ${fullType}.strict();`;
  }
  private _compileExpressionWithTypeArguments(node: ts.ExpressionWithTypeArguments): string {
    return this.compileNode(node.expression);
  }
  private _compileParenthesizedTypeNode(node: ts.ParenthesizedTypeNode): string {
    return this.compileNode(node.type);
  }
  private _compileExportDeclaration(node: ts.ExportDeclaration): string {
    if (node.exportClause && node.moduleSpecifier) {
      const rawModuleSpecifier = node.moduleSpecifier.getText();
      const moduleSpecifier = rawModuleSpecifier.substring(1, rawModuleSpecifier.length - 1);
      // must be a file, for now
      if (moduleSpecifier.startsWith('.')) {
        const exportClause = ['export { '];
        let first: boolean = true;
        for (const element of node.exportClause.elements) {
          let exportPart: string|undefined = undefined;

          if (element.propertyName) {
            exportPart = `${element.propertyName.getText()} as ${element.name.getText()}`;
          }
          else {
            exportPart = element.name.getText();
          }

          exportClause.push(first ? exportPart : `, ${exportPart}`)
          first = false
        }

        // format to new module path
        const filePath = moduleSpecifier
        const ext = path.extname(filePath);
        const dir = this.options.outDir ? './' : path.dirname(filePath);
        const outPath = `${dir}${path.basename(filePath, ext) + this.options.suffix}`;
        exportClause.push(` } from '${outPath}'`)
        return exportClause.join('')
      }
    }
    return '';
  }
  private _compileImportDeclaration(node: ts.ImportDeclaration): string {
    if (node.importClause) {
      const rawModuleSpecifier = node.moduleSpecifier.getText();
      const moduleSpecifier = rawModuleSpecifier.substring(1, rawModuleSpecifier.length - 1);
      // must be a file, for now
      if (moduleSpecifier.startsWith('.')) {
        // also must have named imports (default export interfaces, nope)
        const namedBindings = node.importClause.namedBindings;
        if (namedBindings && namedBindings.kind === ts.SyntaxKind.NamedImports) {
          const importClause = ['import { '];
          let first: boolean = true;
          for (const element of namedBindings.elements) {
            let importPart: string|undefined = undefined;

            if (element.propertyName) {
              importPart = `${element.propertyName.getText()} as ${element.name.getText()}`;
            }
            else {
              importPart = element.name.getText();
            }

            importClause.push(first ? importPart : `, ${importPart}`)
            first = false
          }

          // format to new module path
          const filePath = moduleSpecifier
          const ext = path.extname(filePath);
          const dir = this.options.outDir ? './' : path.dirname(filePath);
          const outPath = `${dir}${path.basename(filePath, ext) + this.options.suffix}`;
          importClause.push(` } from '${outPath}'`)
          return importClause.join('')
        }
      }
    }
    
    if (this.options.inlineImports) {
      const importedSym = this.checker.getSymbolAtLocation(node.moduleSpecifier);
      if (importedSym && importedSym.declarations) {
        // this._compileSourceFile will get called on every imported file when traversing imports. 
        // it's important to check that _compileSourceFile is being run against the topNode 
        // before adding the file wrapper for this reason.
        return importedSym.declarations.map(declaration => this.compileNode(declaration)).join("");
      }
    }
    return '';
  }
  private _compileSourceFileStatements(node: ts.SourceFile): string {
    return node.statements.map(this.compileNode, this).filter((s) => s).join("\n\n");
  }
  private _compileSourceFile(node: ts.SourceFile): string {
    // for imported source files, skip the wrapper
    if (node !== this.topNode) {
      return this._compileSourceFileStatements(node);
    }
    // wrap the top node with a default export
    const prefix = `import * as Joi from "joi";\n` +
                   "// tslint:disable:object-literal-key-quotes\n\n";
    return prefix +
      this._compileSourceFileStatements(node) + "\n\n";// +
      /*"const exportedTypeSuite: t.ITypeSuite = {\n" +
      this.exportedNames.map((n) => `  ${n},\n`).join("") +
      "};\n" +
      "export default exportedTypeSuite;\n";*/
  }
  private _compileIndexSignatureDeclaration(node: ts.IndexSignatureDeclaration): string {
    if (this.options.ignoreIndexSignature) {
      return ignoreNode;
    }

    throw new Error(`Node ${ts.SyntaxKind[node.kind]} not supported by ts-joi-schema-generator: ` +
      node.getText());
  }
  private hasTag(node: ts.Node, tagName: string) {
    const tags = ts.getJSDocTags(node);
    return tags.find((tag) => tag.getText() === `@${tagName}`) !== undefined
  }
}

function getTextOfConstantValue(value: string | number | undefined): string {
  // Typescript has methods to escape values, but doesn't seem to expose them at all. Here I am
  // casting `ts` to access this private member rather than implementing my own.
  return value === undefined ? "undefined" : (ts as any).getTextOfConstantValue(value);
}

function collectDiagnostics(program: ts.Program) {
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return ts.formatDiagnostics(diagnostics, {
    getCurrentDirectory() { return process.cwd(); },
    getCanonicalFileName(fileName: string) { return fileName; },
    getNewLine() { return "\n"; },
  });
}

/**
 * Main entry point when used from the command line.
 */
export async function main() {
  commander
  .description("Create runtime validator module from TypeScript interfaces")
  .usage("[options] <typescript-file...>")
  .option("-g, --ignore-generics", `Ignores generics`)
  .option("-i, --ignore-index-signature", `Ignores index signature`)
  .option("--inline-imports", `Traverses the full import tree and inlines all types into output`)
  .option("-s, --suffix <suffix>", `Suffix to append to generated files (default ${defaultSuffix})`, defaultSuffix)
  .option("-o, --outDir <path>", `Directory for output files; same as source file if omitted`)
  .option("-v, --verbose", "Produce verbose output")
  .parse(process.argv);

  const files: string[] = commander.args;
  const verbose: boolean = commander.verbose;
  const suffix: string = commander.suffix;
  const outDir: string|undefined = commander.outDir;
  const options: ICompilerOptions = {
    ignoreGenerics: commander.ignoreGenerics,
    ignoreIndexSignature: commander.ignoreIndexSignature,
    inlineImports: commander.inlineImports,
    outDir,
    suffix
  };

  if (files.length === 0) {
    commander.outputHelp();
    process.exit(1);
    return;
  }

  for (const filePath of files) {
    // Read and parse the source file.
    const ext = path.extname(filePath);
    const dir = outDir || path.dirname(filePath);
    const outPath = path.join(dir, path.basename(filePath, ext) + suffix + ".ts");
    if (verbose) {
      console.log(`Compiling ${filePath} -> ${outPath}`);
    }
    const generatedCode = defaultHeader + Compiler.compile(filePath, options);
    fs.writeFileSync(outPath, generatedCode);
  }
}
