import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";

const preciseNameSelector = {
  selector: "Identifier[name=/^(data|stuff|thing|doWork|handleIt)$/]",
  message: "Use a precise name that explains the domain object."
};

const functionDocumentationRule = ["error", {
  publicOnly: false,
  require: {
    ArrowFunctionExpression: false,
    ClassDeclaration: true,
    FunctionDeclaration: true,
    FunctionExpression: false,
    MethodDefinition: true
  },
  contexts: [
    "VariableDeclarator[init.type='ArrowFunctionExpression']",
    "VariableDeclarator[init.type='FunctionExpression']",
    "Property[value.type='ArrowFunctionExpression']",
    "Property[value.type='FunctionExpression']"
  ]
}];

const publicFunctionDocumentationRule = ["error", {
  publicOnly: true,
  require: {
    ClassDeclaration: true,
    FunctionDeclaration: true,
    MethodDefinition: true
  }
}];

const runtimeSpineFiles = [
  "src/background/model/**/*.{ts,tsx}",
  "src/background/persistence/**/*.{ts,tsx}",
  "src/background/queue/**/*.{ts,tsx}",
  "src/content/avatar/**/*.{ts,tsx}",
  "src/content/context/**/*.{ts,tsx}",
  "src/content/heuristics/**/*.{ts,tsx}",
  "src/content/observe/**/*.{ts,tsx}",
  "src/content/policy/**/*.{ts,tsx}",
  "src/content/signals/**/*.{ts,tsx}",
  "src/content/state/**/*.{ts,tsx}",
  "src/shared/animation-types.ts",
  "src/shared/intervention-types.ts",
  "src/shared/model-job-types.ts",
  "src/shared/page-types.ts",
  "src/shared/runtime-types.ts"
];

const noUiImports = {
  group: ["**/ui/**", "**/content/ui/**"],
  message: "Runtime brain modules must not render or import UI directly."
};

const noBackgroundImports = {
  group: ["**/background/**"],
  message: "Content observation, state, policy, and animation layers must not import background services."
};

const noContentImports = {
  group: ["**/content/**"],
  message: "Background services must not import content runtime modules."
};

const noModelImports = {
  group: ["**/model-client", "**/pi-model-provider", "**/background/model/**"],
  message: "Deterministic content layers must not import model clients or provider code."
};

const noPolicyImports = {
  group: ["**/content/policy/**"],
  message: "Avatar and animation code must not depend on intervention policy."
};

export default tseslint.config(
  { ignores: [".codex/**", ".output/**", ".wxt/**", "coverage/**", "dist/**", "logs/**", "node_modules/**", "temp/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "scripts/*.mjs"]
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      jsdoc,
      "react-hooks": reactHooks,
      unicorn
    },
    rules: {
      "complexity": ["error", 12],
      "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 4],
      "jsdoc/require-jsdoc": publicFunctionDocumentationRule,
      "@typescript-eslint/no-unused-private-class-members": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        vars: "all",
        varsIgnorePattern: "^_"
      }],
      "no-restricted-syntax": [
        "error",
        preciseNameSelector
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "unicorn/prefer-add-event-listener": "off",
      "unicorn/no-unused-properties": "error",
      "unicorn/prevent-abbreviations": "off"
    }
  },
  {
    files: runtimeSpineFiles,
    rules: {
      "jsdoc/require-jsdoc": functionDocumentationRule
    }
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["*.js", "scripts/*.mjs"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        console: "readonly",
        process: "readonly"
      }
    }
  },
  {
    files: ["src/content/observe/**/*.{ts,tsx}", "src/content/signals/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noBackgroundImports, noModelImports, noUiImports] }]
    }
  },
  {
    files: ["src/content/heuristics/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noBackgroundImports, noModelImports, noUiImports] }]
    }
  },
  {
    files: ["src/content/state/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noBackgroundImports, noModelImports, noUiImports] }]
    }
  },
  {
    files: ["src/content/policy/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noBackgroundImports, noModelImports, noUiImports] }]
    }
  },
  {
    files: ["src/content/avatar/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noBackgroundImports, noModelImports, noPolicyImports] }]
    }
  },
  {
    files: ["src/background/model/**/*.{ts,tsx}", "src/background/queue/**/*.{ts,tsx}", "src/background/persistence/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noContentImports, noUiImports] }]
    }
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          noBackgroundImports,
          noContentImports,
          noUiImports,
          { group: ["**/engine/**", "**/intervention/**"], message: "Shared contracts must not import feature-layer modules." }
        ]
      }]
    }
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "jsdoc/require-jsdoc": "off"
    }
  }
);
