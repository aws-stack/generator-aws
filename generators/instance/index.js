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
  }
  initializing() {
      this.stack = loadStack(this.destinationRoot(), this.options['stack']);
  };
  instancePrompt() {
    var done = this.async();
    var questions = [{
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
      name    : 'key_name',
      message : 'Which key pair should be used in this instance?(empty for none):'
    }, {
      type    : 'input',
      name    : 'ami',
      message : 'What AMI?',
      required: true
    }, {
      type    : 'confirm',
      name    : 'fixed_ip',
      message : 'Shall I assign a fixed private IP to this instance?'
    }, {
      type    : 'list',
      name    : 'subnet',
      message : 'Which subnet is best suited for this instance?',
      choices : Object.keys(this.stack.stack.subnets),
      when    : function(ans) { return ans.fixed_ip }
    }, {
      type    : 'input',
      name    : 'privateIp',
      message : 'What IP should I assign to the instance?',
      when    : function(ans) { return ans.fixed_ip },
      validate: validateInstanceIp
    }, {
      type    : 'list',
      name    : 'public_ip_type',
      choices : [ { name: 'No public IP', value: 'no'},
                  { name: 'Elastic IP', value: 'eip' },
                  { name: 'Random public IP', value: 'public' }],
      message : 'Should we set a public IP to this instance?'
    }, {
      type    : 'input',
      name    : 'eip',
      message : 'Which pre-existing Elastic IP should be assigned to the instance?',
      when    : (ans) => { return ans.public_ip_type == "eip"; }
    }, {
      type    : 'confirm',
      name    : 'setup_volumes',
      message : 'Want to setup volumes now?'
    }];
    return this.prompt(questions).then((answers) => {
      this.answers = answers;
      if (this.answers.setup_volumes) {
          this._setupVolumes(done, 0);
      }
    });
  };

  _setupVolumes(done, volIndex) {
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
              this._setupVolumes(done, ++volIndex);
          } else done();
      });
  };

  prepareData() {
      delete this.answers.setup_volumes;
      this.answers.volumes = this.volumes;
      var data = {};
      data[this.answers.name] = this.answers;
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

