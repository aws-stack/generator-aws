var Generator = require('yeoman-generator');
var fs = require('fs');
//var CIDR = require('node-cidr');

function loadProject(path, project_name) {
    var yaml = require('js-yaml');
    var data = yaml.safeLoad(fs.readFileSync(path+'/projects/'+project_name.yaml));
    console.log(JSON.stringify(data));
};

module.exports = class extends Generator {
  constructor(args,opts) {
      super(args,opts);
      this.argument('project', { type: String, required: true });
      this.answers = {};
  }
  initializing() {
      loadProject(this.destinationRoot(), this.arguments.project);
  };
  prompting() {
    var questions = [{
      type    : 'input',
      name    : 'name',
      message : 'Instance name:'
    }, {
      type    : 'confirm',
      name    : 'fixed_ip',
      message : 'Shall I assign a private IP to this instance?'
    }, {
      type    : 'input',
      name    : 'env',
      message : 'Environment name(prod/qa/dev):',
      default : 'prod'
    }, {
      type    : 'input',
      name    : 'private_ip',
      message : 'What IP should I assign to the instance?',
      when    : function(ans) { return ans.fixed_ip }
    }];
    return this.prompt(questions).then((answers) => {
      this.answers = answers;
    });
  };

  createInstance() {
      this.log(JSON.stringify(this.answers));
  }
};


