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
    "/dev/sda1",
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

function validateInstanceIp(ip) {
    //TODO: make sure the IP is inside the CIDR block of the subnet
    return true;
}

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
      message : 'How the new instance is going to be called?',
      validate: validateTag
    }, {
      type    : 'input', // list didn't work well here because there are too many options
      name    : 'instance_type',
      message : 'What is the instance type for the new instance?',
      default : 't2.micro',
      validate: validateInstanceType
    }, {
      type    : 'input',
      name    : 'security_groups',
      message : 'Which security groups should I assign to the instance(s)?'
    }, {
      type    : 'input',
      name    : 'key_name',
      message : 'Which key pair should be used in this instance?(empty for key):'
    }, {
      type    : 'input',
      name    : 'ami',
      message : 'What AMI should be used for instance creation?',
      required: true
    }, {
      type    : 'confirm',
      name    : 'setup_volumes',
      message : 'Want to setup volumes now?'
    }];
    return this.prompt(questions).then((answers) => {
      this.answers = answers;
      if (this.answers.setup_volumes) {
          this._setupVolumes(0, done);
      } else done();
    });
  };

  _instanceQuestions() {
    return [
      {
          type    : 'list',
          name    : 'subnet',
          message : 'Which subnet is best suited for this instance?',
          choices : Object.keys(this.stack.stack.subnets),
      }, {
          type    : 'confirm',
          name    : 'fixed_ip',
          message : 'Shall I assign a fixed private IP to this instance?'
      }, {
          type    : 'input',
          name    : 'private_ip',
          message : 'What IP should I assign to the instance?',
          when    : function(ans) { return ans.fixed_ip },
          validate: validateInstanceIp
      }, {
          type    : 'list',
          name    : 'public_ip_type',
          choices : IP_CHOICES,
          message : 'Should we set a public IP to this instance?'
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
          var instance = {};
          if (answers.fixed_ip) { instance.private_ip = answers.private_ip };
          if (answers.public_ip_type == 'eip') { instance.eip = answers.eip }; // TODO: handle ip_type = public
          if (typeof this.instance_group[answers.subnet] == 'undefined') {
              this.instance_group[answers.subnet] = [];
          }
          this.instance_group[answers.subnet].push(instance);
          if (answers.more_instances) {
              this._promptInstanceGroup(done);
          } else {
              done();
          }
      });
  };

  promptingInstanceGroup() {
      if (this.answers.ec2_type != "group") return;
      var done = this.async();
      return this._promptInstanceGroup(done);
  };

  promptingASG() {
      if (this.answers.ec2_type != "autoscaling") return;
      let asgQuestions = [
          {
              type    : 'checkbox',
              name    : 'subnets',
              message : 'In which subnets the autoscaling group should launch instances?',
              choices : Object.keys(this.stack.stack.subnets)
          }, {
              type   : 'input',
              name   : 'min_size',
              message: "What's the minimum size of the ASG?",
              default: "1"
          }, {
              type   : 'input',
              name   : 'max_size',
              message: "What's the maximum size of the ASG?",
              default: "2"
          }
      ];
      return this.prompt(asgQuestions).then((answers) => {
          this.answers = Object.assign(this.answers, answers);
      });
  };

  _setupVolumes(volIndex, done) {
      let volQuestion = [{
          type   : 'input',
          name   : 'vol_'+volIndex+'_name',
          message: "How should I name volume "+ volIndex + "?",
          default: () => { return volIndex == 0 ? 'root' : 'vol'+volIndex; }
      }, {
          type   : 'input',
          name   : 'vol_'+volIndex+'_size',
          message: "Size of the volume"
      }, {
          type   : 'confirm',
          name   : 'vol_'+volIndex+'_delete',
          message: "Should this volume be deleted when the instance is terminated?",
          default: false
      }, {
          type   : 'list',
          choices: DEVICE_NAMES,
          name   : 'vol_'+volIndex+'_device',
          message: "Device name for this volume",
          default: volIndex
      }, {
          type   : 'list',
          choices: VOLUME_TYPES,
          name   : 'vol_'+volIndex+'_type',
          message: "Type of the volume"
      }, {
          type   : 'confirm',
          name   : 'add_another',
          message: "Add another volume?"
      }];
      return this.prompt(volQuestion).then((answers) => {
          this.volumes.push({
              'name': answers['vol_'+volIndex+'_name'],
              'device_name': answers['vol_'+volIndex+'_device'],
              'size': answers['vol_'+volIndex+'_size'],
              'type': answers['vol_'+volIndex+'_type'],
              'delete_on_termination': answers['vol_'+volIndex+'_delete'],
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
      this.log(yaml.safeDump(this.instance_data));
      this.fs.write(
              this.destinationPath('stacks/'+this.options['stack']+'/'+this.answers.name+'.yml'),
              yaml.safeDump(this.instance_data));
      this.fs.copyTpl(
              this.templatePath('instance-meta.yml'),
              this.destinationPath('infrastructure/roles/'+this.answers.name+'/meta/main.yml'),
              { name: this.answers.name } );
      this.fs.write(
              this.destinationPath('deploy/roles/'+this.options['stack']+'/'+this.answers.name+'/tasks/main.yml'),
              '---\n');
  };
};

