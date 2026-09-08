export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'build', 'ci', 'revert']],
        'type-case': [2, 'always', 'lower-case'],
        'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
        'subject-full-stop': [2, 'never', '.'],
        'subject-max-length': [2, 'always', 50],
        'header-max-length': [2, 'always', 72],
        'scope-case': [2, 'always', 'lower-case'],
        'scope-enum': [1, 'always', ['crypto', 'calc', 'types', 'state', 'validate', 'ids', 'import', 'license', 'fingerprint', 'docs', 'build', 'ci', 'deps']],
        'body-max-line-length': [0],
    },
}