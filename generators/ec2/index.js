var Generator = require('yeoman-generator');
var fs = require('fs');
var yaml = require('js-yaml');
var CIDR = require('node-cidr');

INSTANCE_TYPES = [
  "c1.medium","c1.xlarge",
  "c3.2xlarge","c3.4xlarge","c3.8xlarge","c3.large","c3.xlarge",
  "c4.2xlarge","c4.4xlarge","c4.8xlarge","c4.large","c4.xlarge",
  "cc2.8xlarge",
  "cg1.4xlarge",
  "cr1.8xlarge",
  "d2.2xlarge","d2.4xlarge","d2.8xlarge","d2.xlarge",
  "f1.16xlarge","f1.2xlarge",
  "g2.2xlarge","g2.8xlarge",
  "hi1.4xlarge","hs1.8xlarge",
  "i2.2xlarge","i2.4xlarge","i2.8xlarge","i2.xlarge",
  "i3.16xlarge","i3.2xlarge","i3.4xlarge","i3.8xlarge","i3.large","i3.xlarge",
  "m1.large","m1.medium","m1.small","m1.xlarge",
  "m2.2xlarge","m2.4xlarge","m2.xlarge",
  "m3.2xlarge","m3.large","m3.medium","m3.xlarge",
  "m4.10xlarge","m4.16xlarge","m4.2xlarge","m4.4xlarge","m4.large","m4.xlarge",
  "p2.16xlarge","p2.8xlarge","p2.xlarge",
  "r3.2xlarge","r3.4xlarge","r3.8xlarge","r3.large","r3.xlarge",
  "r4.16xlarge","r4.2xlarge","r4.4xlarge","r4.8xlarge","r4.large","r4.xlarge",
  "t1.micro",
  "t2.2xlarge","t2.large","t2.medium","t2.micro","t2.nano","t2.small","t2.xlarge",
  "x1.16xlarge","x1.32xlarge"
]

VOLUME_TYPES = [ 'gp2', 'io1', 'st1', 'sc1', 'standard' ];

DEVICE_NAMES = [
    "/dev/xvdf",
    "/dev/xvdg",
    "/dev/xvdh",
    "/dev/xvdi",
    "/dev/xvdj",
    "/dev/xvdk",
    "/dev/xvdl",
    "/dev/xvdm",
    "/dev/xvdn",
    "/dev/xvdo",
    "/dev/xvdp",
    "/dev/xvdq",
    "/dev/xvdr",
    "/dev/xvds",
    "/dev/xvdt",
    "/dev/xvdu",
    "/dev/xvdv",
    "/dev/xvdw",
    "/dev/xvdx",
    "/dev/xvdy",
    "/dev/xvdz",
];

EC2_TYPE_CHOICES = [
    { name: 'Single Instance', value: 'instance' },
    { name: 'Group of instances', value: 'group' },
    { name: 'Auto scaling group', value: 'autoscaling' }
];

IP_CHOICES = [
  { name: 'No public IP', value: 'none'},
  { name: 'Elastic IP', value: 'eip' },
  { name: 'Random public IP', value: 'public' }
];

function loadStack(path, stack_name) {
    return yaml.safeLoad(fs.readFileSync(path+'/stacks/'+stack_name+'/main.yml'));
};

function validateTag(tag) {
    //TODO: only printable chars, no whitespace
    return true;
};

function validateInstanceType(type) {
  return INSTANCE_TYPES.indexOf(type) > 0 ? true : 'Invalid instance type';
};

module.exports = class extends Generator {
  constructor(args,opts) {
      super(args,opts);
      this.argument('stack', { type: String, required: true });
      this.answers = {};
      this.volumes = [];
      this.instance_group = {};
  }
  initializing() {
      this.stack = loadStack(this.destinationRoot(), this.options['stack']);
  };
  instancePrompt() {
    var done = this.async();
    var questions = [{
      type    : 'list',
      name    : 'ec2_type',
      choices : EC2_TYPE_CHOICES,
      message : 'What type of EC2 resources should I create?'
    }, {
      type    : 'input',
      name    : 'name',
      message : "How is it going to be called?",
      validate: validateTag
    }, {
      type    : 'input', // list didn't work well here because there are too many options
      name    : 'instance_type',
      message : 'What is the instance type for the new instance?',
      default : 't2.micro',
      validate: validateInstanceType
    }, {
      type    : 'input',
      name    : 'key_name',
      message : 'Which key pair should be used in this instance?(empty for no key):'
    }, {
      type    : 'input',
      name    : 'ami',
      message : 'What AMI should be used for instance creation?',
      required: true
    }, {
      type    : 'input',
      name    : 'security_groups',
      message : 'Please specify the security group name(s) separated by comma:',
      required: true
    }, {
      type    : 'confirm',
      name    : 'setup_volumes',
      message : 'Want to setup volumes now?'
    }];
    return this.prompt(questions).then((answers) => {
      answers.security_groups = answers.security_groups.split(',');
      if (answers.key_name.length == 0) delete answers.key_name;
      this.answers = answers;
      if (this.answers.setup_volumes) {
          this._setupVolumes(0, done);
      } else done();
    });
  };

  _validateInstanceIp(ip, answers) {
      if (ip.length == 0) return true;
      let subnet_cidr = new CIDR.Subnetv4(this.stack.stack.subnets[answers.subnet]);
      return subnet_cidr.includes(new CIDR.IPv4(ip)) || "IP "+ip+" doesn't fall in subnet range "+subnet_cidr.asString;
  };

  _instanceQuestions() {
    return [
      {
          type    : 'list',
          name    : 'subnet',
          message : 'In which subnet this instance should be launched?',
          choices : Object.keys(this.stack.stack.subnets),
      }, {
          type    : 'input',
          name    : 'private_ip',
          message : 'Specify the private ip for the instance (or leave empty for automatic):',
          validate: this._validateInstanceIp.bind(this)
      }, {
          type    : 'list',
          name    : 'public_ip_type',
          choices : IP_CHOICES,
          message : 'Do it need a public IP?'
      }, {
          type    : 'input',
          name    : 'eip',
          message : 'Which pre-existing Elastic IP should be assigned to the instance?',
          when    : (ans) => { return ans.public_ip_type == "eip"; }
      }
    ];
  };

  promptingSingleInstance() {
      if (this.answers.ec2_type != "instance") return;
      return this.prompt(this._instanceQuestions()).then((answers) => {
          if (answers.private_ip.length == 0) delete answers.private_ip;
          this.answers = Object.assign(this.answers, answers);
      });
  };

  _promptInstanceGroup(done, idx) {
      var questions = this._instanceQuestions();
      questions.push(
              {
                  type    : 'confirm',
                  name    : 'more_instances',
                  message : 'Do you want to add more instances?'
              });

      return this.prompt(questions).then((answers) => {
          var instance = { id: idx };
          if (answers.private_ip != "") { instance.private_ip = answers.private_ip };
          if (answers.public_ip_type == 'eip') { instance.eip = answers.eip }; // TODO: handle ip_type = public
          if (typeof this.instance_group[answers.subnet] == 'undefined') {
              this.instance_group[answers.subnet] = [];
          }
          this.instance_group[answers.subnet].push(instance);
          if (answers.more_instances) {
              this._promptInstanceGroup(done, idx++);
          } else {
              done();
          }
      });
  };

  promptingInstanceGroup() {
      if (this.answers.ec2_type != "group") return;
      var done = this.async();
      return this._promptInstanceGroup(done, 1);
  };

  promptingASG() {
      if (this.answers.ec2_type != "autoscaling") return;
      let asgQuestions = [
          {
              type    : 'checkbox',
              name    : 'subnets',
              message : 'Choose the subnets where the instances will be launched:',
              choices : Object.keys(this.stack.stack.subnets)
          }, {
              type   : 'input',
              name   : 'min_size',
              message: "Minimum number of instances:",
              default: "1"
          }, {
              type   : 'input',
              name   : 'max_size',
              message: "Maximum number of instances:",
              default: "2"
          }, {
              type   : 'input',
              name   : 'elb_name',
              message: "Load balancer name(empty for no ELB):"
          }
      ];
      return this.prompt(asgQuestions).then((answers) => {
          if (answers.elb_name.length == 0) delete answers.elb_name;
          this.answers = Object.assign(this.answers, answers);
      });
  };

  _setupVolumes(volIndex, done) {
      let volQuestion = [{
          type   : 'input',
          name   : 'name',
          message: "Volume "+volIndex+" name:",
          default: () => { return volIndex == 0 ? 'root' : 'vol'+volIndex; }
      }, {
          type   : 'list',
          choices: VOLUME_TYPES,
          name   : 'volume_type',
          message: "Type of the volume"
      }, {
          type   : 'input',
          name   : 'volume_size',
          message: "Volume size:",
          default: 8
      }, {
          type   : 'confirm',
          name   : 'delete_on_termination',
          message: "Should this volume be deleted when the instance is terminated?",
          default: false
      }];
      if (volIndex > 0) {
        volQuestion.push({
              type   : 'list',
              choices: DEVICE_NAMES,
              name   : 'device_name',
              message: "Device name for this volume",
              default: volIndex
          });
      }
      volQuestion.push({
              type   : 'confirm',
              name   : 'add_another',
              message: "Add another volume?"
          });
      return this.prompt(volQuestion).then((answers) => {
          if (volIndex==0) { answers['device_name'] = '/dev/sda1' };
          this.volumes.push({
              'name': answers.name,
              'device_name': answers.device_name,
              'volume_size': answers.volume_size,
              'volume_type': answers.volume_type,
              'delete_on_termination': answers['delete_on_termination'],
          });
          if (answers.add_another) {
              this._setupVolumes(++volIndex, done);
          } else done();
      });
  };

  prepareData() {
      delete this.answers.setup_volumes;
      if (this.volumes.length > 0) {
          this.answers.volumes = this.volumes;
      }
      var data = {};
      data.ec2_conf = this.answers;
      if (Object.keys(this.instance_group).length > 0) data.ec2_conf.group = this.instance_group;
      this.instance_data = data;
  };

  createInstance() {
      var done = this.async();
      this.fs.write(
              this.destinationPath('stacks/'+this.options['stack']+'/'+this.answers.name+'.yml'),
              yaml.safeDump(this.instance_data));
      this.fs.copy(
              this.templatePath('ec2-launch.yml'),
              this.destinationPath('infrastructure/ec2-launch.yml'));
      try {
          this.spawnCommand('ansible-galaxy', [
                  'install',
                  '--roles-path', this.destinationPath('infrastructure/roles'),
                  'git+https://github.com/aws-stack/ec2'
                ]);
      } catch (e) {
          this.log('Error trying to run ansible-galaxy. Please make sure ansible is installed and in your PATH');
      }
      this.answers.security_groups.forEach((sg) => {
          let path = this.destinationPath('stacks/'+this.options['stack']+'/security-groups/'+sg+'.yml');
          if (!fs.exists(path)) {
              this.log('Definition file for security group '+sg+' not found in path '+path+
                       '. Run `yo aws:sg '+this.options.stack+'` to create it');
          }
      });
      return done();
  };
};

