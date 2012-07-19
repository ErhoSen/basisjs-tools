
var html_at = require('../html/ast_tools');

module.exports = function(flow){
  var fconsole = flow.console;
  var queue = flow.files.queue;

  for (var i = 0; file = queue[i]; i++)
    if (file.type == 'script' && file.htmlNode)
    {
      fconsole.log(file.relpath);
      if (file.outputFilename)
      {
        html_at.replaceToken(file.htmlNode, {
          type: 'script',
          name: 'script',
          attribs: {
            type: 'text/javascript',
            src: file.relOutputFilename + '?' + file.digest
          }
        });
      }
      else
      {
        html_at.replaceToken(file.htmlNode, 
          file.outputContent
            ? {
                type: 'script',
                name: 'script',
                attribs: {
                  type: 'text/javascript'
                },
                children: [
                  {
                    type: 'text',
                    data: file.outputContent
                  }
                ]
              }
            : {
                type: 'text',
                data: ''
              }
        );
      }
    }
};

module.exports.handlerName = '[js] Modify <script> entry in html file';