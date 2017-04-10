var Generator = require('yeoman-generator');
var CIDR = require('node-cidr');
var yaml = require('js-yaml');

module.exports = class extends Generator {
  constructor(args,opts) {
      super(args,opts);
      this.answers = {};
      this.argument('stack', { type: String, required: true });
      this.rules = [];
  }
  prompting() {
    var done = this.async();
    var questions = [{
      type    : 'input',
      name    : 'sg_name',
      message : 'Security group name:'
    }, {
      type    : 'input',
      name    : 'sg_description',
      message : 'Description:'
    }];
    return this.prompt(questions).then((answers) => {
      this.answers = answers;
      this._addRule(done);
    });
  };

  _addRule(done) {
      var questions = [ {
          type      : 'list',
          name      : 'proto',
          message   : 'Protocol:',
          choices   : [ 'tcp', 'udp', 'any' ]
      }, {
          type      : 'input',
          name      : 'port',
          message   : 'Port range (ex.: 80, 80-81)',
          validate  : (port) => { return (port > 1 && port < 65536 ? true : 'Invalid port') },
          required  : true
      }, {
          type      : 'input',
          name      : 'cidr_ip',
          message   : 'IP:',
          default   : '0.0.0.0/0'
      }, {
          type      : 'confirm',
          name      : 'add_another',
          message   : 'Add another rule?'
      }];
      return this.prompt(questions).then((answers) => {
          var ports = answers['port'].split('-');
          var from_port = ports[0];
          var to_port = ports.length == 2 ? ports[1] : from_port;
          this.rules.push({
              'proto': answers.proto,
              'from_port': from_port,
              'to_port': to_port,
              'cidr_ip': answers.cidr_ip
          });
          if (answers.add_another) {
              this._addRule(done);
          } else done();
      });
  };

  createSG() {
      this.answers.rules = this.rules;
      this.fs.write(
              this.destinationPath('stacks/'+this.options['stack']+'/sg-'+this.answers.sg_name+'.yml'),
              yaml.safeDump(this.answers));
  }
};


