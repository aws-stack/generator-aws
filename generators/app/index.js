var Generator = require('yeoman-generator');
var CIDR = require('node-cidr');

var AWS_REGIONS = [
        "ap-south-1",
        "eu-west-2",
        "eu-west-1",
        "ap-northeast-2",
        "ap-northeast-1",
        "sa-east-1",
        "ca-central-1",
        "ap-southeast-1",
        "ap-southeast-2",
        "eu-central-1",
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2"
    ];

function validate_region(region) {
    return AWS_REGIONS.indexOf(region) > 0;
}

module.exports = class extends Generator {
  constructor(args,opts) {
      super(args,opts);
      this.answers = {};
  }
  _subnet_question(seq) {
      let dseq = seq + 1;
      return [
        { type: 'input', name: 'subnet_'+seq+'_name', message: 'Subnet '+dseq+' name:',
          validate: this._validate_subnet_name.bind(this) },
        { type: 'input', name: 'subnet_'+seq+'_cidr', message: 'Subnet '+dseq+' cidr:',
          validate: this._validate_subnet.bind(this),
          default: this._next_cidr.bind(this)
        }
      ];
  };
  _next_cidr() {
      let cidr = this._curr_cidr;
      this._curr_cidr = cidr.next;
      return cidr.asString;
  };
  _validate_subnet_name(subnet) {
    let lastDash = subnet.lastIndexOf('-');
    if (lastDash == -1) {
        return 'Please postfix the subnet name with the AZ where it will live. Ex: '+subnet+'-a';
    }
    let az = subnet[lastDash+1];
    if ([ 'a', 'b', 'c', 'd', 'e' ].indexOf(az) >= 0) {
        return true; //TODO: this could be improved to only accept existing AZs
    } else {
        return 'Subnet should be in the range [a-e]';
    }
  };
  _validate_subnet(cidr) {
    let vpc_cidr = new CIDR.Subnetv4(this.answers.vpc_cidr);
    let subnet_cidr = new CIDR.Subnetv4(cidr);
    let subnet_list = [];
    vpc_cidr.subnets(''+subnet_cidr._bitMask).
        forEach(subnet=>subnet_list.push(subnet.asString));
    if (subnet_list.indexOf(cidr) >= 0) {
        return true;
    } else {
        return 'The CIDR '+cidr+" must be inside the VPC range: "+this.answers.vpc_cidr;
    }
  };
  _validate_cidr(cidr) {
    let vpc_cidr = new CIDR.Subnetv4(cidr);
    let ok = vpc_cidr._bitMask >= 16 && vpc_cidr._bitMask <= 28;
    if (ok) {
        this._curr_cidr = vpc_cidr.subnets('24',1)[0];
        return true;
    } else {
        return 'VPC CIDR block should be between /16 and /28';
    }
  };
  prompting() {
    var questions = [{
      type    : 'input',
      name    : 'name',
      message : 'Stack name:'
    }, {
      type    : 'choice',
      choices : AWS_REGIONS,
      name    : 'region',
      message : 'In which AWS region this stack will live?'
    }, {
      type    : 'input',
      name    : 'env',
      message : 'Environment (ex: prod/qa/dev):',
      default : 'prod'
    }, {
      type    : 'input',
      name    : 'vpc_cidr',
      message : 'What CIDR block should we use to create this stack?',
      default : '10.0.0.0/16',
      validate: this._validate_cidr.bind(this)
    }, {
      type    : 'input',
      name    : 'subnet_count',
      message : 'How many subnets would you like to add?',
      default : 2
    }];
    return this.prompt(questions).then((answers) => {
      this.answers = answers;
    });
  };

  promptingSubnet() {
      // I would like to find a better way to do this but I couldn't find
      // a simpler way to do it using yeoman/inquire.js API
      var subnet_questions = [];
      this.answers.subnets = {};
      for (var i=0; i < this.answers.subnet_count; i++) {
          subnet_questions = subnet_questions.concat(this._subnet_question(i));
      }
      return this.prompt(subnet_questions).then((answers) => {
          for (var i =0; i < this.answers.subnet_count; i++) {
              var name = answers['subnet_'+i+'_name'];
              this.answers.subnets[name] = answers[['subnet_'+i+'_cidr']];
          };
      });
  };

  createVPC() {
      this.fs.copyTpl(
              this.templatePath('stack.tpl'),
              this.destinationPath('stacks/'+this.answers.name+'/main.yml'),
              { 'data': this.answers }
              );
      this.fs.copy(
              this.templatePath('vpc-main.yml'),
              this.destinationPath('infrastructure/roles/vpc/tasks/main.yml'));
      this.fs.copy(
              this.templatePath('create-vpc.yml'),
              this.destinationPath('infrastructure/create-vpc.yml'));
  }
};


