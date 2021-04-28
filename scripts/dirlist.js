const fs = require('fs');

const genIndex = (root, path = '') => {
  console.log(`-> ${root}${path}`);
  const contents = fs
    .readdirSync(root + path, { withFileTypes: true })
    .filter(
      (c) =>
        c.isDirectory() ||
        (/\./.test(c.name) && c.name !== 'index.html' && c.name[0] !== '.'),
    );
  contents.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return 0;
  });

  const html =
    '<!DOCTYPE html><style>*{font-family: sans-serif}a{text-decoration: none}</style><p><a href="../">↖️ Parent</a><ul>' +
    contents
      .map((c) => {
        if (c.isDirectory()) {
          return `<li><a href="./${c.name}">📂 ${c.name}</a></li>`;
        } else {
          const { size } = fs.statSync(root + path + '/' + c.name);
          return `<li><a href="./${c.name}">📄 ${c.name}</a> ${size}b</li>`;
        }
      })
      .join('') +
    '</ul>';

  fs.writeFileSync(root + path + '/index.html', html);

  contents
    .filter((c) => c.isDirectory())
    .forEach((c) => {
      genIndex(root, path ? path + '/' + c.name : '/' + c.name);
    });
};

genIndex('./data');
